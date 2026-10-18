-- Tabelas internas (dados financeiros/pessoais) passam a ser só da equipa (staff).
--
-- Antes: 20260825000000 deu LEITURA a qualquer "authenticated" — o que inclui
-- qualquer cliente que se registe no catálogo público — e deixou
-- insert/update/delete abertos a "anon" e a qualquer "authenticated".
-- Ou seja: qualquer pessoa criava uma conta de cliente e lia IBAN/NIFs/
-- contabilidade, ou alterava saldos de cf_accounts, lançamentos, etc.
--
-- ⚠️  APLICAR SÓ DEPOIS de todos os dispositivos (Electron e web) terem a versão
--     da app que traz hasStaffSession() em src/lib/sync.ts (mesmo commit que
--     esta migração). Ver "Impacto na sincronização" abaixo.
--
-- ── Porque é que isto NÃO repete o erro de 20260810190000 ──────────────────
-- Esse bloqueio foi revertido (20260811000000) porque a sincronização era
-- "faz-e-esquece": quando a sessão expirava a meio de um turno, as vendas
-- deixavam de chegar à nuvem sem ninguém saber. Hoje:
--
--   * Electron: todas as escritas destas tabelas passam pela fila sync_outbox
--     (electron/db.cjs, enqueueUpsert/enqueueDelete em src/lib/localDB.ts).
--     drainOutbox() só marca uma entrada como enviada quando o Supabase a
--     confirma; e, com esta versão da app, só tenta enviar quando há uma
--     sessão real de STAFF (hasStaffSession) — antes bastava qualquer sessão,
--     incluindo a de um cliente. Isto importa por causa dos DELETEs: com RLS,
--     um delete sem permissão não dá erro (apaga 0 linhas), e a entrada seria
--     marcada como enviada e perdida. Sem sessão de staff, a fila espera.
--   * A escrita anónima nestas tabelas JÁ não funcionava na prática desde
--     20260825000000: upsert (INSERT ... ON CONFLICT) e UPDATE/DELETE com
--     WHERE precisam de permissão de SELECT, que "anon" deixou de ter. Só um
--     INSERT simples passava. Os únicos INSERT simples da app nestas tabelas
--     são em clients (ImportPrimaveraTab.tsx e InvoicesTab.tsx), ambos ecrãs
--     de Admin que já mostram o erro ao utilizador.
--   * O que muda de facto: (a) clientes registados deixam de ler estas
--     tabelas; (b) clientes registados deixam de conseguir escrever nelas.
--     Hoje o checkout (Cart.tsx → registerSaleMovement) escreve, a partir do
--     telemóvel do cliente, cf_movements, cf_accounts (SALDOS calculados com a
--     cópia local do cliente, que pode estar vazia/desactualizada) e
--     journal_entries. Isso passa a ser recusado (erro só na consola do
--     cliente, a encomenda continua a ser criada normalmente). O movimento de
--     caixa e o lançamento da venda online são criados pelo dispositivo da
--     loja: syncAllData() / reconcile em src/lib/cashflow.ts usam ids
--     determinísticos (sync-sale-{orderId}) a partir das encomendas.
--
-- ── Impacto na sincronização ───────────────────────────────────────────────
--   * Electron com conta de staff ligada à nuvem: igual a hoje.
--   * Electron sem sessão (login local de recurso / offline) ou com sessão de
--     cliente: as escritas ficam na fila sync_outbox e vão quando houver
--     sessão de staff ("Sincronizar agora" mostra "sem sessão"). Já era assim
--     para upserts; passa a ser assim também para deletes.
--   * Browser (sem Electron, sem fila): staff com sessão expirada já perdia os
--     upserts destas tabelas desde 20260825000000 (sem SELECT); nada muda.
--     Continua a ser um risco conhecido — a correcção é dar fila ao browser,
--     não abrir a base.
--   * pullAll() com sessão de cliente/anon: estas tabelas voltam vazias. Já
--     acontecia com anon desde 20260825000000; o código faz merge com a cópia
--     local e reaplica a fila (applyPendingOutbox).
--   * store_settings: o checkout dos clientes usa nome, WhatsApp, coordenadas
--     da loja, etc. Como deixam de poder ler a tabela, há uma função nova
--     public_store_settings() que devolve SÓ os campos públicos (nunca IBAN,
--     conta bancária, capital social, etc.) — pullAll() usa-a quando a
--     leitura normal não devolve nada.
--
-- Fora desta migração, de propósito:
--   * products, categories, delivery_zones, promo_codes, stores: leitura
--     pública necessária ao catálogo; a escrita continua aberta a anon. Ao
--     contrário das tabelas abaixo, aqui anon TEM SELECT, por isso upserts
--     anónimos funcionam hoje — fechar a escrita partiria de facto o Admin no
--     browser com sessão expirada (o erro de 20260811000000). Fica para quando
--     o browser tiver fila. (promo_codes: o Cart incrementa "uses" do lado do
--     cliente — precisa de RPC próprio antes de fechar.)
--   * orders/order_items: página pública "Verificar Pedido".
--   * map_references: leitura continua para qualquer "authenticated" (o Cart
--     usa-as para calcular a entrega); só a escrita passa a staff.

-- ── is_staff() ──────────────────────────────────────────────────────────────
-- Foi apagada em 20260813210000 por não ter uso; volta a ser precisa aqui.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role from profiles where id = auth.uid()) in ('admin', 'employee', 'gerente', 'super_admin'),
    false
  )
$$;
revoke execute on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

-- ── Políticas: staff lê e escreve; mais ninguém ─────────────────────────────
-- Apaga TODAS as políticas existentes destas tabelas (não só as de nomes
-- conhecidos). Como as políticas permissivas se combinam com "OU", uma única
-- política antiga esquecida (ex: as "anon sync ..." dos scripts manuais
-- anon_policies.sql/missing_tables.sql, ou as de schema.sql) anularia tudo.
do $$
declare
  t   text;
  pol record;
begin
  foreach t in array array[
    'clients', 'cf_accounts', 'cf_categories', 'cf_movements',
    'accounting_accounts', 'journal_entries', 'shift_sessions',
    'suppliers', 'purchases', 'cash_flow', 'returns',
    'loyalty_transactions', 'store_settings',
    'sales', 'sale_items', 'stock_entries'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
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

-- map_references: leitura para quem tem sessão (Cart), escrita só staff.
do $$
declare
  pol record;
begin
  if to_regclass('public.map_references') is null then
    return;
  end if;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'map_references' loop
    execute format('drop policy %I on public.map_references', pol.policyname);
  end loop;
  alter table public.map_references enable row level security;
  create policy "leitura autenticada map_references" on public.map_references
    for select to authenticated using (true);
  create policy "staff gere map_references" on public.map_references
    for all to authenticated using (is_staff()) with check (is_staff());
end $$;

-- ── Campos públicos de store_settings (para o catálogo/checkout) ────────────
-- Lista fechada de campos: uma coluna nova (ex: outro dado bancário) nunca
-- fica pública por engano. to_jsonb(...)->'campo' devolve null se a coluna não
-- existir, em vez de rebentar.
create or replace function public.public_store_settings(p_store_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'name',               j->'name',
    'tagline',            j->'tagline',
    'description',        j->'description',
    'phone',              j->'phone',
    'whatsapp',           j->'whatsapp',
    'email',              j->'email',
    'address',            j->'address',
    'nif',                j->'nif',
    'iva_rate',           j->'iva_rate',
    'logo_url',           j->'logo_url',
    'delivery_enabled',   j->'delivery_enabled',
    'min_order_delivery', j->'min_order_delivery',
    'opening_hours',      j->'opening_hours',
    'store_lat',          j->'store_lat',
    'store_lng',          j->'store_lng'
  ))
  from (
    select to_jsonb(s) as j
    from store_settings s
    where (p_store_id is not null and to_jsonb(s)->>'store_id' = p_store_id)
       or (p_store_id is null and to_jsonb(s)->>'id' = '1')
    limit 1
  ) x
$$;
revoke execute on function public.public_store_settings(text) from public;
grant execute on function public.public_store_settings(text) to anon, authenticated;

-- ── Verificação depois de aplicar ──────────────────────────────────────────
--   select tablename, policyname, roles, cmd, qual, with_check
--   from pg_policies where schemaname = 'public'
--     and tablename in ('clients','cf_accounts','cf_movements','journal_entries','store_settings')
--   order by tablename;
--   -- Deve haver só "staff gere <tabela>" em cada uma.
--
-- ── Para reverter (se algo crítico parar) ───────────────────────────────────
-- Voltar ao estado de 20260825000000 é reaplicar o bloco "do $$ ... $$" dessa
-- migração (leitura authenticated, escrita anon+authenticated). NÃO voltar a
-- "for all to anon using (true)".
