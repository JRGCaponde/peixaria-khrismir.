-- ============================================================================
-- REINICIALIZAR OS DADOS — apaga os dados de negócio, mantém a estrutura.
-- NÃO É UMA MIGRAÇÃO: corre-se à mão, uma vez, no SQL Editor do Supabase.
--
-- ANTES DE CORRER (sem isto não há como recuperar):
--   1. Backup: Admin → Sistema → "Baixar Backup" + copia %APPDATA%\peixaria-khrismir\khrismir.db
--   2. Fecha a app em TODOS os dispositivos (PDV, Admin, telemóveis, site aberto).
--      Um dispositivo ligado com dados antigos volta a enviá-los para a base vazia.
--
-- O QUE APAGA: produtos, categorias, encomendas (+ itens), vendas, compras,
-- fornecedores, turnos, devoluções, fidelização, promoções, zonas de entrega,
-- fluxo de caixa, contabilidade (contas + diário), pontos do mapa, clientes.
--
-- O QUE MANTÉM (de propósito): as lojas (stores), os perfis/contas de
-- utilizador (profiles) e as configurações da loja (store_settings, com o IBAN).
-- Assim não perdes o acesso de admin nem tens de recriar a loja.
-- Para apagar também isso, descomenta o bloco "OPCIONAL" no fim.
--
-- Corre tudo dentro de uma transacção: se algo falhar, NADA é apagado.
-- ============================================================================

do $$
declare
  t text;
begin
  -- Ordem importa: tabelas filhas (com chave estrangeira) antes das mães.
  foreach t in array array[
    'order_items', 'orders',
    'sale_items', 'sales', 'stock_entries',
    'purchases', 'cash_flow',
    'cf_movements', 'cf_accounts', 'cf_categories',
    'journal_entries', 'accounting_accounts',
    'returns', 'loyalty_transactions', 'shift_sessions',
    'delivery_zones', 'promo_codes', 'map_references',
    'suppliers', 'clients',
    'products', 'categories'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      -- "where true": este projecto já recusou "DELETE" sem WHERE (ver reset_all_data).
      execute format('delete from %I where true', t);
      raise notice 'apagado: %', t;
    else
      raise notice 'não existe (ignorado): %', t;
    end if;
  end loop;
end $$;

-- Confirmação: tudo deve aparecer a 0 (stores/profiles/store_settings mantêm-se).
select 'products' as tabela, count(*) as linhas from products
union all select 'orders', count(*) from orders
union all select 'purchases', count(*) from purchases
union all select 'cf_movements', count(*) from cf_movements
union all select 'cf_accounts', count(*) from cf_accounts
union all select 'journal_entries', count(*) from journal_entries
union all select '--- mantidos ---', 0
union all select 'stores', count(*) from stores
union all select 'profiles', count(*) from profiles
union all select 'store_settings', count(*) from store_settings;

-- ── OPCIONAL: só se quiseres mesmo recomeçar com lojas e contas vazias ──────
-- ATENÇÃO: apagar profiles tira-te o acesso de admin; depois de entrares de novo
-- tens de correr:  update profiles set role = 'super_admin' where email = 'o-teu-email';
--
-- delete from store_settings where true;
-- delete from profiles       where true;
-- delete from stores         where true;
