-- Fecha os dois últimos acessos abertos a qualquer pessoa com a chave pública:
--
--   1) orders / order_items: "sync orders" (20260811000000) é "for all to anon
--      using (true)". Confirmado ao vivo em 2026-10-18: um pedido sem login
--      devolvia nome, telefone e morada de clientes. Também permitia a qualquer
--      pessoa alterar ou apagar encomendas.
--   2) products / categories / delivery_zones / promo_codes: leitura pública
--      (o catálogo precisa) mas também ESCRITA pública — qualquer pessoa podia
--      mudar preços, apagar produtos ou criar códigos de desconto.
--
-- ⚠️  APLICAR SÓ DEPOIS de todos os dispositivos (site e PCs) terem a versão da
--     app que vem no mesmo commit desta migração. A versão antiga grava as
--     encomendas do catálogo directamente na tabela, e isso passa a ser
--     recusado — as encomendas online deixariam de chegar à loja.
--
-- ── Porque é que isto NÃO repete o erro de 20260811000000 ──────────────────
-- Esse bloqueio perdeu vendas porque, sem sessão, as escritas falhavam sem
-- nada para as repetir. Com esta versão da app:
--   * A fila offline (sync_outbox) passa a existir também no browser (em
--     localStorage, ver src/lib/localDB.ts) para quem é da equipa — uma venda
--     no POS ou uma alteração de preço sem sessão fica na fila e é enviada
--     quando houver sessão de staff (hasStaffSession), em vez de se perder.
--   * As baixas de stock (decrement_product_stock) também entram na fila
--     quando falham (antes perdiam-se offline).
--   * As encomendas do catálogo (clientes e visitantes) passam pela função
--     registar_encomenda(), que não precisa de permissões nas tabelas.
--   * A página "Verificar Pedido" usa verificar_pedido(), que devolve só o
--     estado e os artigos — nunca nome, telefone ou morada.
--   * O contador de usos dos códigos de desconto passa por usar_promo().
--
-- Fica de fora, de propósito: "stores" (o ecrã "Seleccionar Loja" do login
-- local lê-a antes de haver sessão — ver 20260825000000).

-- ── Apagar TODAS as políticas existentes destas tabelas ─────────────────────
-- (políticas permissivas somam-se com "OU": uma antiga esquecida anulava tudo)
do $$
declare
  t   text;
  pol record;
begin
  foreach t in array array['orders', 'order_items', 'products', 'categories', 'delivery_zones', 'promo_codes']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "staff gere %s" on public.%I for all to authenticated using (is_staff()) with check (is_staff())',
      t, t
    );
  end loop;
end $$;

-- Catálogo: leitura pública (Catalog.tsx / Cart.tsx carregam antes de qualquer login).
create policy "leitura pública products"       on public.products       for select to anon, authenticated using (true);
create policy "leitura pública categories"     on public.categories     for select to anon, authenticated using (true);
create policy "leitura pública delivery_zones" on public.delivery_zones for select to anon, authenticated using (true);
create policy "leitura pública promo_codes"    on public.promo_codes    for select to anon, authenticated using (true);

-- Encomendas: o cliente com sessão vê as suas (página "Os meus pedidos").
create policy "cliente vê as suas encomendas" on public.orders
  for select to authenticated using (customer_id = auth.uid());
create policy "cliente vê os itens das suas encomendas" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_items.order_id and o.customer_id = auth.uid())
  );

-- ── registar_encomenda(): encomenda do catálogo, sem acesso às tabelas ──────
-- Insere só as colunas que vêm no JSON (as outras ficam com o valor por
-- omissão). O que quem encomenda não pode escolher é forçado aqui:
--   status 'pendente', customer_id = a própria sessão (null se anónimo),
--   nada de conversões/documentos. Uma encomenda que já exista nunca é
--   alterada (repetir o envio é seguro — devolve true sem mexer).
create or replace function public.registar_encomenda(p_order jsonb, p_items jsonb default '[]'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    text := p_order->>'id';
  v_store text := p_order->>'store_id';
  v_order jsonb;
  v_item  jsonb;
  v_cols  text;
begin
  if coalesce(v_id, '') = '' or coalesce(p_order->>'order_number', '') = '' then
    raise exception 'Encomenda sem id ou número' using errcode = '22023';
  end if;
  if v_store is null or not exists (select 1 from stores s where s.id::text = v_store) then
    raise exception 'Loja desconhecida' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 then
    raise exception 'Itens inválidos' using errcode = '22023';
  end if;

  if exists (select 1 from orders where id = v_id) then
    return true;
  end if;

  v_order := p_order || jsonb_build_object(
    'status', 'pendente',
    'customer_id', auth.uid(),
    'doc_type', null,
    'converted_to_order_id', null,
    'converted_from_order_id', null,
    'paid_at', null,
    'updated_at', now()
  );

  select string_agg(quote_ident(c.column_name), ', ')
    into v_cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'orders'
    and v_order ? c.column_name;
  execute format('insert into orders (%1$s) select %1$s from jsonb_populate_record(null::orders, $1)', v_cols)
    using v_order;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_item := v_item || jsonb_build_object('order_id', v_id, 'store_id', v_store);
    select string_agg(quote_ident(c.column_name), ', ')
      into v_cols
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'order_items'
      and v_item ? c.column_name;
    execute format(
      'insert into order_items (%1$s) select %1$s from jsonb_populate_record(null::order_items, $1) on conflict (id) do nothing',
      v_cols
    ) using v_item;
  end loop;

  return true;
end;
$$;
revoke execute on function public.registar_encomenda(jsonb, jsonb) from public;
grant execute on function public.registar_encomenda(jsonb, jsonb) to anon, authenticated;

-- ── verificar_pedido(): página pública "Verificar Pedido" ───────────────────
-- Só o estado e o conteúdo do pedido — nunca nome, telefone, NIF ou morada.
create or replace function public.verificar_pedido(p_order_number text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id',            o.id,
    'order_number',  o.order_number,
    'status',        o.status,
    'created_at',    o.created_at,
    'delivery_type', o.delivery_type,
    'payment_type',  o.payment_type,
    'delivery_fee',  o.delivery_fee,
    'discount_amount', o.discount_amount,
    'subtotal',      o.subtotal,
    'total',         o.total,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'product_name', i.product_name, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'preparation', i.preparation, 'total_price', i.total_price
      ))
      from order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from orders o
  where lower(o.order_number) = lower(trim(p_order_number))
  order by o.created_at desc
  limit 1
$$;
revoke execute on function public.verificar_pedido(text) from public;
grant execute on function public.verificar_pedido(text) to anon, authenticated;

-- ── usar_promo(): conta um uso de um código de desconto ─────────────────────
-- O Cart.tsx actualizava a linha inteira de promo_codes a partir do browser do
-- cliente. Agora só pode somar 1, e só se o código ainda for válido.
create or replace function public.usar_promo(p_promo_id text)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  update promo_codes
     set uses = coalesce(uses, 0) + 1
   where id::text = p_promo_id
     and coalesce(active, true)
     and (max_uses is null or max_uses <= 0 or coalesce(uses, 0) < max_uses)
     and (expires_at is null or expires_at > now())
  returning uses
$$;
revoke execute on function public.usar_promo(text) from public;
grant execute on function public.usar_promo(text) to anon, authenticated;

-- ── Verificação depois de aplicar ──────────────────────────────────────────
--   select tablename, policyname, roles, cmd from pg_policies
--   where schemaname = 'public'
--     and tablename in ('orders','order_items','products','categories','delivery_zones','promo_codes')
--   order by tablename;
-- Com a chave anon (sem login), GET /rest/v1/orders deve devolver [] e
-- POST /rest/v1/rpc/verificar_pedido {"p_order_number":"PKH-..."} o estado.
