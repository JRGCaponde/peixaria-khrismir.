-- decrement_product_stock() acumulou 3 versões sobrepostas ao longo do tempo
-- (parâmetros ora "text", ora "uuid"), o que faz o PostgREST falhar com
-- "Could not choose the best candidate function" — a baixa de stock nunca
-- chegava a gravar no servidor (ficava só local, mascarado pela actualização
-- optimista no browser). Remove todas as versões e recria uma só, com os
-- tipos correctos (products.id e stores.id são "text" nesta base de dados).

drop function if exists decrement_product_stock(p_product_id text, p_quantity numeric, p_store_id text);
drop function if exists decrement_product_stock(p_product_id text, p_quantity numeric, p_store_id uuid);
drop function if exists decrement_product_stock(p_product_id uuid, p_quantity numeric, p_store_id uuid);

create or replace function decrement_product_stock(
  p_product_id text,
  p_quantity numeric,
  p_store_id text default null
)
returns table (stock_quantity numeric)
language sql
as $$
  update products
  set stock_quantity = greatest(0, stock_quantity - p_quantity)
  where id = p_product_id
  returning stock_quantity;
$$;
