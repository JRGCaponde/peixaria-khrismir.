-- orders_payment_type_check só deixava 'multicaixa'|'express'|'dinheiro' — falta 'misto'
-- (pagamento dividido no PDV).
alter table orders drop constraint if exists orders_payment_type_check;
alter table orders add constraint orders_payment_type_check check (payment_type in ('multicaixa','express','dinheiro','misto'));
