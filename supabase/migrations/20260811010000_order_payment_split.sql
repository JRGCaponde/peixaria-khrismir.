-- Pagamentos divididos no PDV (ex: metade dinheiro, metade Multicaixa/TPA).
alter table orders add column if not exists payment_split jsonb;
