-- Vendas/compras a crédito (Contas a Pagar / Contas a Receber)
alter table orders add column if not exists payment_status text;
alter table orders add column if not exists paid_at timestamptz;
alter table purchases add column if not exists payment_status text;
alter table purchases add column if not exists paid_at timestamptz;
