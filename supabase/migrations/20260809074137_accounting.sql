-- Contabilidade por partidas dobradas (PGC-AO)
create table if not exists accounting_accounts (
  id         text primary key default gen_random_uuid()::text,
  code       text not null,
  name       text not null,
  class      int not null,
  nature     text not null check (nature in ('devedora','credora')),
  editable   boolean default true,
  store_id   text,
  created_at timestamptz default now()
);

create table if not exists journal_entries (
  id          text primary key default gen_random_uuid()::text,
  date        date not null,
  description text not null,
  reference   text,
  source      text not null default 'manual',
  lines       jsonb not null,  -- [{account_code, debit, credit}]
  store_id    text,
  created_at  timestamptz default now()
);

alter table accounting_accounts enable row level security;
alter table journal_entries     enable row level security;

create policy "anon sync accounting_accounts" on accounting_accounts for all to anon using (true) with check (true);
create policy "anon sync journal_entries"     on journal_entries     for all to anon using (true) with check (true);
