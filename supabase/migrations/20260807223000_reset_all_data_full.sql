-- Actualiza reset_all_data(): a versão de 2026-05-05 só cobria as tabelas que
-- existiam nessa altura. Desde então foram adicionadas lojas (stores), perfis
-- de utilizador (profiles), PRIMAVERA (clients/sales/sale_items/stock_entries)
-- e o novo Fluxo de Caixa (cf_movements/cf_accounts/cf_categories) — nenhuma
-- delas era apagada. Esta versão cobre tudo, e usa to_regclass para nunca
-- falhar mesmo que alguma tabela não exista neste ambiente.
--
-- NÃO apaga `licenses` (activação/licenciamento do próprio app — não é dado
-- de negócio).
--
-- AVISO: isto inclui `profiles` — apaga as contas/perfis de admin e
-- funcionários. Depois de correr, o primeiro login recria automaticamente um
-- perfil novo com role='client'; é preciso voltar a promover manualmente via
-- SQL Editor: update profiles set role='super_admin' where email='...';

create or replace function reset_all_data()
returns void
language plpgsql
security definer
as $$
declare
  t text;
begin
  foreach t in array array[
    'order_items', 'orders',
    'sale_items', 'sales', 'stock_entries', 'clients',
    'products', 'categories',
    'cash_flow', 'purchases', 'delivery_zones', 'promo_codes',
    'suppliers', 'returns', 'loyalty_transactions', 'shift_sessions',
    'cf_movements', 'cf_accounts', 'cf_categories',
    'profiles', 'stores'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from %I', t);
    end if;
  end loop;

  if to_regclass('public.store_settings') is not null then
    delete from store_settings;
    insert into store_settings (id) values (1) on conflict (id) do nothing;
  end if;
end;
$$;

grant execute on function reset_all_data() to authenticated;
grant execute on function reset_all_data() to anon;
