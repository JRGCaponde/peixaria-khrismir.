-- Entrega calculada por distância real loja → cliente
create table if not exists map_references (
  id         text primary key default gen_random_uuid()::text,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  store_id   text,
  created_at timestamptz default now()
);
alter table map_references enable row level security;
create policy "anon sync map_references" on map_references for all to anon using (true) with check (true);

alter table orders add column if not exists delivery_lat double precision;
alter table orders add column if not exists delivery_lng double precision;
alter table orders add column if not exists delivery_distance_km numeric;

alter table store_settings add column if not exists store_lat double precision;
alter table store_settings add column if not exists store_lng double precision;
