-- Tabelas em falta na versão inicial do schema

-- FORNECEDORES
create table if not exists suppliers (
  id         text primary key default gen_random_uuid()::text,
  name       text not null,
  nif        text default '',
  phone      text default '',
  email      text default '',
  address    text default '',
  notes      text default '',
  created_at timestamptz default now()
);

-- TURNOS
create table if not exists shift_sessions (
  id               text primary key default gen_random_uuid()::text,
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,
  opening_balance  numeric not null default 0,
  closing_balance  numeric,
  cash_counted     numeric,
  difference       numeric,
  opened_by        text not null default '',
  closed_by        text,
  notes            text default ''
);

-- DEVOLUÇÕES
create table if not exists returns (
  id            text primary key default gen_random_uuid()::text,
  order_id      text default '',
  order_number  text not null,
  customer_name text default '',
  items         jsonb default '[]',
  total         numeric not null default 0,
  reason        text not null default '',
  created_at    timestamptz default now()
);

-- FIDELIZAÇÃO
create table if not exists loyalty_transactions (
  id          text primary key default gen_random_uuid()::text,
  client_id   text not null default '',
  client_name text not null default '',
  points      numeric not null default 0,
  type        text not null check (type in ('earned','redeemed')),
  order_id    text default '',
  created_at  timestamptz default now()
);

-- RLS para todas as novas tabelas
alter table suppliers           enable row level security;
alter table shift_sessions      enable row level security;
alter table returns             enable row level security;
alter table loyalty_transactions enable row level security;

-- Policies anon para permitir sync do Electron
create policy "anon sync suppliers"    on suppliers            for all to anon using (true) with check (true);
create policy "anon sync shifts"       on shift_sessions       for all to anon using (true) with check (true);
create policy "anon sync returns"      on returns              for all to anon using (true) with check (true);
create policy "anon sync loyalty"      on loyalty_transactions for all to anon using (true) with check (true);

-- Adicionar colunas em falta em tabelas existentes (já aplicado anteriormente, seguro re-executar)
alter table products add column if not exists cost_price  numeric default 0;
alter table products add column if not exists expiry_date date;
