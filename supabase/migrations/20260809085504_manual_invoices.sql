-- Facturas manuais FA (definitiva) / FP (proforma), dedicadas a clientes
alter table orders add column if not exists doc_type text;
alter table orders add column if not exists converted_to_order_id text;
alter table orders add column if not exists converted_from_order_id text;
