-- ============================================================================
-- LIMPEZA TOTAL E PERMANENTE — não fica NADA: dados, lojas, configurações
-- (incluindo o IBAN), perfis e contas de login do Supabase.
-- NÃO É UMA MIGRAÇÃO: corre-se à mão, uma vez, no SQL Editor do Supabase.
-- NÃO HÁ DESFAZER.
--
-- DEPOIS DE CORRER ficas sem nenhuma conta de acesso. Para voltar a entrar:
--   1. Abre a app e regista-te ("Cadastre-se") com o teu email.
--   2. No SQL Editor corre:
--        update profiles set role = 'super_admin' where email = 'O-TEU-EMAIL';
--   3. Entra, cria a loja e configura-a de novo.
--
-- Tudo corre numa transacção: se algo falhar, NADA é apagado.
-- ============================================================================

do $$
declare
  t text;
begin
  -- Filhas antes das mães (chaves estrangeiras).
  foreach t in array array[
    'order_items', 'orders',
    'sale_items', 'sales', 'stock_entries',
    'purchases', 'cash_flow',
    'cf_movements', 'cf_accounts', 'cf_categories',
    'journal_entries', 'accounting_accounts',
    'returns', 'loyalty_transactions', 'shift_sessions',
    'delivery_zones', 'promo_codes', 'map_references',
    'suppliers', 'clients',
    'products', 'categories',
    'store_settings',
    'profiles',
    'stores'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from %I where true', t);
      raise notice 'apagado: %', t;
    else
      raise notice 'não existe (ignorado): %', t;
    end if;
  end loop;

  -- Contas de login (autenticação do Supabase). Sem isto, os emails continuam
  -- registados e não consegues voltar a registar-te com eles.
  delete from auth.users where true;
  raise notice 'apagado: auth.users';
end $$;

-- Confirmação: tudo deve aparecer a 0.
select 'products' as tabela, count(*) as linhas from products
union all select 'orders', count(*) from orders
union all select 'purchases', count(*) from purchases
union all select 'cf_movements', count(*) from cf_movements
union all select 'cf_accounts', count(*) from cf_accounts
union all select 'journal_entries', count(*) from journal_entries
union all select 'store_settings', count(*) from store_settings
union all select 'stores', count(*) from stores
union all select 'profiles', count(*) from profiles
union all select 'auth.users', count(*) from auth.users;
