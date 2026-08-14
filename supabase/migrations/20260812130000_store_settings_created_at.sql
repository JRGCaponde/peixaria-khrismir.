-- "Configurações: Could not find the 'created_at' column of 'store_settings'"
alter table store_settings add column if not exists created_at timestamptz default now();
