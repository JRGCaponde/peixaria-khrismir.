-- REVERTE a maior parte do bloqueio de escrita de 20260810190000_lockdown_rls_policies.sql.
--
-- Motivo: confirmado ao vivo que uma factura a crédito criada num dispositivo
-- nunca chegou ao Supabase — ficou só local, sem nenhum erro visível. Causa:
-- a app sincroniza tudo em segundo plano, sem esperar pelo resultado nem
-- mostrar erro se falhar (registerSaleMovement, syncOrder, syncCfMovements,
-- syncProductStock, etc. são todos "faz-e-esquece"). Exigir sessão Supabase
-- válida (is_staff()/authenticated) para gravar nestas tabelas significa que,
-- sempre que a sessão expira sozinha a meio de um turno (já visto acontecer
-- hoje várias vezes), TODAS as vendas/facturas/movimentos desse dispositivo
-- deixam de chegar aos outros — silenciosamente, sem ninguém notar até
-- reparar que os números não batem certo entre dispositivos.
--
-- A leitura (select) destas tabelas já estava aberta mesmo antes de hoje, por
-- isso restringir só a escrita não estava a fechar uma fuga de dados real —
-- só estava a arriscar perder vendas. Não vale a pena o risco.
--
-- Mantém-se APENAS a correcção em profiles (impedir alguém de se auto-
-- promover a admin): essa não passa pelos mesmos caminhos de sincronização
-- em segundo plano, por isso não tem este problema.

do $$
declare
  t text;
begin
  foreach t in array array[
    'products','categories','delivery_zones','promo_codes','store_settings','stores','map_references',
    'accounting_accounts','cash_flow','cf_accounts','cf_categories','cf_movements',
    'journal_entries','purchases','suppliers','shift_sessions','stock_entries',
    'sales','sale_items','loyalty_transactions','returns','clients'
  ]
  loop
    execute format('drop policy if exists "leitura pública" on %I', t);
    execute format('drop policy if exists "staff gere" on %I', t);
    execute format('create policy "sync %s" on %I for all to anon, authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

drop policy if exists "leitura (temporária)" on orders;
drop policy if exists "clientes autenticados criam" on orders;
drop policy if exists "staff actualiza encomendas" on orders;
drop policy if exists "staff apaga encomendas" on orders;
create policy "sync orders" on orders for all to anon, authenticated using (true) with check (true);

drop policy if exists "leitura itens (temporária)" on order_items;
drop policy if exists "clientes autenticados criam itens" on order_items;
drop policy if exists "staff actualiza itens" on order_items;
drop policy if exists "staff apaga itens" on order_items;
create policy "sync order_items" on order_items for all to anon, authenticated using (true) with check (true);

-- profiles NÃO é tocada aqui — mantém a correcção de hoje (auto-promoção a admin).
