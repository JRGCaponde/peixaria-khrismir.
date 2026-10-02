-- Fecha a LEITURA anónima de tabelas com dados financeiros/pessoais sensíveis
-- (IBAN, contas bancárias, NIFs de clientes, contabilidade, turnos, fornecedores).
--
-- Confirmado ao vivo por auditoria em 2026-08-25: um simples pedido HTTP com a
-- chave pública (anon), sem login nenhum, conseguia ler bank_iban/bank_account
-- de store_settings, NIFs de clients, saldos de cf_accounts, lançamentos de
-- journal_entries, etc. — porque a migração 20260811000000 tinha aberto
-- "for all to anon, authenticated using (true)" (leitura + escrita) nestas
-- tabelas.
--
-- IMPORTANTE: esta migração só mexe na LEITURA (select). A ESCRITA continua
-- deliberadamente aberta a "anon", exactamente como a 20260811000000 já
-- explicava: a sincronização desta app é toda "faz-e-esquece" (sem esperar
-- resultado nem mostrar erro se falhar) e a sessão Supabase já expirou a meio
-- de turnos reais várias vezes — exigir sessão autenticada para ESCREVER
-- causou perda silenciosa de vendas nesse dia. Restringir só a leitura não
-- tem esse risco: uma leitura falhada apenas deixa a cache local por
-- refrescar (pullAll() já faz merge local+cloud em vez de substituir), nunca
-- perde uma venda nova.
--
-- Tabelas deixadas de fora de propósito (continuam com leitura pública tal
-- como estava, porque o catálogo/checkout público (Catalog.tsx, Cart.tsx,
-- main.tsx) depende de um pullAll() anónimo antes de qualquer login):
-- products, categories, delivery_zones, promo_codes, orders, order_items,
-- profiles (já estava correctamente restrita antes desta migração).
--
-- "stores" foi tentada aqui mas revertida no mesmo dia: confirmado ao vivo
-- que um funcionário novo, ao entrar antes de confirmar o email (ou a testar
-- no mesmo computador do admin), usa o caminho de acesso local da app — que
-- nunca teve sessão Supabase real — e esse caminho precisa de ler "stores"
-- para mostrar o ecrã "Seleccionar Loja". Sem essa leitura, o funcionário
-- fica com a lista de lojas vazia e não consegue entrar. "stores" só tem
-- nome/morada/telefone/NIF/email da loja (não tem dados bancários — esses
-- estão em store_settings, que continua fechada) — muito menos sensível do
-- que o resto desta migração, por isso não vale o risco de bloquear staff.
--
-- Também remove políticas residuais de dois scripts antigos, corridos à mão
-- antes de existirem migrações (supabase/anon_policies.sql e
-- supabase/missing_tables.sql), que criaram políticas "anon sync ..." com
-- outros nomes nestas mesmas tabelas e nunca foram removidas por nenhuma
-- migração seguinte. Como o Postgres combina várias políticas permissivas
-- com "OU", essas políticas antigas continuariam a autorizar leitura anónima
-- mesmo depois de criar as políticas novas abaixo, tornando esta correcção
-- inútil nas tabelas afectadas.

drop policy if exists "anon sync settings" on store_settings;
drop policy if exists "anon sync caixa" on cash_flow;
drop policy if exists "anon sync compras" on purchases;
drop policy if exists "anon sync suppliers" on suppliers;
drop policy if exists "anon sync shifts" on shift_sessions;
drop policy if exists "anon sync returns" on returns;
drop policy if exists "anon sync loyalty" on loyalty_transactions;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'cf_accounts', 'cf_categories', 'cf_movements',
    'accounting_accounts', 'journal_entries', 'shift_sessions',
    'suppliers', 'purchases', 'cash_flow', 'map_references',
    'returns', 'loyalty_transactions', 'store_settings'
  ]
  loop
    execute format('drop policy if exists "sync %s" on %I', t, t);
    execute format('drop policy if exists "leitura autenticada %s" on %I', t, t);
    execute format('drop policy if exists "escrita %s" on %I', t, t);
    execute format('drop policy if exists "actualizacao %s" on %I', t, t);
    execute format('drop policy if exists "remocao %s" on %I', t, t);
    execute format('create policy "leitura autenticada %s" on %I for select to authenticated using (true)', t, t);
    execute format('create policy "escrita %s" on %I for insert to anon, authenticated with check (true)', t, t);
    execute format('create policy "actualizacao %s" on %I for update to anon, authenticated using (true) with check (true)', t, t);
    execute format('create policy "remocao %s" on %I for delete to anon, authenticated using (true)', t, t);
  end loop;
end $$;

-- Repõe "stores" com leitura pública igual a antes de hoje (ver explicação
-- acima) — remove as políticas granulares desta migração e recria a política
-- original "sync stores".
drop policy if exists "leitura autenticada stores" on stores;
drop policy if exists "escrita stores" on stores;
drop policy if exists "actualizacao stores" on stores;
drop policy if exists "remocao stores" on stores;
drop policy if exists "sync stores" on stores;
create policy "sync stores" on stores for all to anon, authenticated using (true) with check (true);

-- Impede que um visitante anónimo apague toda a base de dados através desta
-- função (delete em quase todas as tabelas, incluindo stores e profiles).
-- Não há nenhum fluxo legítimo do app que precise disto sem sessão.
--
-- Revoga de "public" também: ao criar/substituir uma função, o Postgres
-- concede EXECUTE a "public" (toda a gente) por omissão — revogar só de
-- "anon" não chega, porque "anon" continua a herdar via "public". Confirmado
-- ao vivo: mesmo depois do "revoke ... from anon" sozinho, uma chamada
-- anónima ainda entrava a executar a função (só não apagou nada porque um
-- erro interno a meio abortou a transacção toda).
revoke execute on function reset_all_data() from public;
revoke execute on function reset_all_data() from anon;
grant execute on function reset_all_data() to authenticated;
