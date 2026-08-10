-- Fecha o acesso anónimo total encontrado na auditoria de produção: quase
-- todas as tabelas tinham uma política "for all using (true)" que permitia
-- a QUALQUER pessoa, sem login nenhum, ler e escrever à vontade — incluindo
-- alterar o próprio "role" em profiles para se tornar admin.
--
-- Nota de arquitectura importante: current_user_role() só funciona com uma
-- sessão real do Supabase Auth (usa auth.uid()). O login local de recurso
-- (usado quando o Supabase está inacessível) não gera essa sessão — por
-- isso, a partir desta migração, contas em modo local de recurso perdem
-- acesso de escrita às tabelas internas enquanto estiverem nesse modo.
-- Isto é aceite: agora que o registo/login reais foram corrigidos, o modo
-- local deve ser raro (só quando genuinamente offline).
--
-- pullAll() continua a tentar ler todas as tabelas para qualquer visitante
-- (é assim que o catálogo público carrega) — isso não parte com esta
-- migração: os pedidos bloqueados por RLS voltam só com "sem dados", sem
-- erro, e o código já trata isso (if (x.data) ...).

create or replace function public.is_staff()
returns boolean
language sql stable
as $$
  select coalesce(current_user_role() in ('admin','employee','gerente','super_admin'), false)
$$;

-- ── Grupo A — catálogo/dados públicos: leitura livre, escrita só staff ──
do $$
declare
  t text;
begin
  foreach t in array array['products','categories','delivery_zones','promo_codes','store_settings','stores','map_references']
  loop
    execute format('drop policy if exists %I on %I', 'sync ' || t, t);
    execute format('drop policy if exists %I on %I', 'anon sync ' || t, t);
    execute format('drop policy if exists "leitura pública" on %I', t);
    execute format('drop policy if exists "staff gere" on %I', t);
    execute format('create policy "leitura pública" on %I for select using (true)', t);
    execute format('create policy "staff gere" on %I for all using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

-- ── Grupo B — dados internos (contabilidade, caixa, compras, etc.): só staff, nada de público ──
-- Duas políticas antigas fogem ao padrão de nome "sync <tabela>" — remover à parte.
drop policy if exists "sync loyalty" on loyalty_transactions;
drop policy if exists "sync shifts" on shift_sessions;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounting_accounts','cash_flow','cf_accounts','cf_categories','cf_movements',
    'journal_entries','purchases','suppliers','shift_sessions','stock_entries',
    'sales','sale_items','loyalty_transactions','returns','clients'
  ]
  loop
    execute format('drop policy if exists %I on %I', 'sync ' || t, t);
    execute format('drop policy if exists %I on %I', 'anon sync ' || t, t);
    execute format('drop policy if exists "staff gere" on %I', t);
    execute format('create policy "staff gere" on %I for all using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

-- ── Grupo C — orders / order_items: leitura ainda aberta (ver nota abaixo),
--    mas escrita já restrita — só clientes autenticados criam, só staff edita/apaga ──
drop policy if exists "sync orders" on orders;
drop policy if exists "leitura (temporária)" on orders;
drop policy if exists "clientes autenticados criam" on orders;
drop policy if exists "staff actualiza encomendas" on orders;
drop policy if exists "staff apaga encomendas" on orders;
create policy "leitura (temporária)" on orders for select using (true);
create policy "clientes autenticados criam" on orders for insert to authenticated with check (true);
create policy "staff actualiza encomendas" on orders for update using (is_staff());
create policy "staff apaga encomendas" on orders for delete using (is_staff());

drop policy if exists "sync order_items" on order_items;
drop policy if exists "leitura itens (temporária)" on order_items;
drop policy if exists "clientes autenticados criam itens" on order_items;
drop policy if exists "staff actualiza itens" on order_items;
drop policy if exists "staff apaga itens" on order_items;
create policy "leitura itens (temporária)" on order_items for select using (true);
create policy "clientes autenticados criam itens" on order_items for insert to authenticated with check (true);
create policy "staff actualiza itens" on order_items for update using (is_staff());
create policy "staff apaga itens" on order_items for delete using (is_staff());
-- NOTA: orders/order_items continuam legíveis por qualquer visitante — é o que
-- sustenta hoje a página pública "Verificar Pedido". Corrigir isto a sério
-- exige mudar essa página para não depender de trazer as últimas 100
-- encomendas para o dispositivo de toda a gente — tarefa separada, já
-- combinada como próximo passo.

-- ── Grupo D — profiles: fecha a brecha mais grave (auto-promoção a admin) ──
drop policy if exists "sync profiles" on profiles;
drop policy if exists "utilizador vê o próprio perfil" on profiles;
drop policy if exists "utilizador actualiza o próprio perfil" on profiles;
drop policy if exists "utilizador cria o próprio perfil" on profiles;
create policy "utilizador vê o próprio perfil" on profiles for select using (auth.uid() = id);
create policy "utilizador actualiza o próprio perfil" on profiles for update using (auth.uid() = id);
create policy "utilizador cria o próprio perfil" on profiles for insert with check (auth.uid() = id);
-- Mantém as políticas "admin cria/edita/ve todos perfis" já existentes.

-- "licenses" não é tocada aqui de propósito: o ecrã de activação corre antes
-- de qualquer login, por isso não há sessão para current_user_role() usar.
