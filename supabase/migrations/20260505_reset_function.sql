-- Função de reset total — SECURITY DEFINER bypassa o RLS
-- Pode ser chamada por qualquer utilizador autenticado ou anónimo
-- mas executa com privilégios do dono da função (postgres), apagando tudo

create or replace function reset_all_data()
returns void
language plpgsql
security definer
as $$
begin
  -- Ordem respeitando FKs: filhos antes de pais
  delete from order_items;
  delete from orders;
  delete from products;
  delete from categories;
  delete from cash_flow;
  delete from purchases;
  delete from delivery_zones;
  delete from promo_codes;
  delete from suppliers;
  delete from returns;
  delete from loyalty_transactions;
  delete from shift_sessions;
end;
$$;

-- Permitir que qualquer utilizador (autenticado ou anónimo) chame a função
grant execute on function reset_all_data() to authenticated;
grant execute on function reset_all_data() to anon;
