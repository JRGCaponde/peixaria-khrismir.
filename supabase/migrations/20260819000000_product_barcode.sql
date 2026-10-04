-- Suporte a leitor de código de barras nos produtos (PDV)
alter table products add column if not exists barcode text;
create index if not exists idx_products_barcode on products(barcode) where barcode is not null;
