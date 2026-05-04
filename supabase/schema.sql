-- ============================================================
--  PEIXARIA KHRISMIR — Schema Supabase
--  Cole este ficheiro inteiro no SQL Editor do seu projecto
--  Supabase: https://supabase.com → SQL Editor → New query
-- ============================================================

-- Extensões necessárias
create extension if not exists "uuid-ossp";

-- ── PERFIS DE UTILIZADORES ───────────────────────────────────
-- Guarda o papel (role) e dados extra de cada utilizador Auth
create table if not exists profiles (
  id          uuid    primary key references auth.users on delete cascade,
  full_name   text    not null default '',
  phone       text    default '',
  role        text    not null default 'client'
                check (role in ('admin', 'employee', 'client')),
  created_at  timestamptz default now()
);

-- Cria automaticamente o perfil quando o utilizador se regista
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'client')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Função auxiliar para obter o papel do utilizador actual
create or replace function current_user_role()
returns text language sql security definer stable as $$
  select role from profiles where id = auth.uid()
$$;

-- ── CATEGORIAS ───────────────────────────────────────────────
create table if not exists categories (
  id          text    primary key default gen_random_uuid()::text,
  name        text    not null,
  description text    default '',
  image_url   text    default '',
  created_at  timestamptz default now()
);

-- ── PRODUTOS ─────────────────────────────────────────────────
create table if not exists products (
  id              text    primary key default gen_random_uuid()::text,
  name            text    not null,
  price           numeric not null check (price >= 0),
  unit            text    not null default 'kg',
  stock_quantity  numeric not null default 0,
  min_stock       numeric not null default 5,
  allow_whole     boolean default true,
  allow_clean     boolean default false,
  allow_fillet    boolean default false,
  allow_steak     boolean default false,
  category_id     text    references categories(id) on delete set null,
  image_url       text    default '',
  created_at      timestamptz default now()
);

-- ── ENCOMENDAS ───────────────────────────────────────────────
create table if not exists orders (
  id               text    primary key default gen_random_uuid()::text,
  order_number     text    not null unique,
  customer_id      uuid    references profiles(id) on delete set null,
  customer_name    text    default '',
  customer_phone   text    default '',
  customer_nif     text    default '',
  status           text    not null default 'pendente'
                   check (status in ('pendente','confirmado','preparando','pronto','entregue','cancelado')),
  payment_type     text    not null
                   check (payment_type in ('multicaixa','express','dinheiro')),
  delivery_type    text    not null default 'retirada'
                   check (delivery_type in ('retirada','delivery')),
  delivery_zone    text    default '',
  delivery_fee     numeric default 0,
  delivery_address text    default '',
  discount_code    text    default '',
  discount_amount  numeric default 0,
  subtotal         numeric default 0,
  total            numeric not null check (total >= 0),
  notes            text    default '',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Actualiza updated_at automaticamente
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger orders_updated_at before update on orders
  for each row execute procedure set_updated_at();

-- ── ITENS DAS ENCOMENDAS ─────────────────────────────────────
create table if not exists order_items (
  id           text    primary key default gen_random_uuid()::text,
  order_id     text    not null references orders(id) on delete cascade,
  product_id   text    default '',
  product_name text    not null,
  quantity     numeric not null,
  unit_price   numeric not null,
  preparation  text    not null,
  total_price  numeric not null
);

-- ── FLUXO DE CAIXA ───────────────────────────────────────────
create table if not exists cash_flow (
  id           text    primary key default gen_random_uuid()::text,
  type         text    not null check (type in ('entrada','saida')),
  amount       numeric not null check (amount >= 0),
  description  text    not null,
  order_number text    default '',
  payment_type text    default '',
  created_at   timestamptz default now()
);

-- ── COMPRAS / ENTRADAS DE STOCK ──────────────────────────────
create table if not exists purchases (
  id           text    primary key default gen_random_uuid()::text,
  product_id   text    default '',
  product_name text    default '',
  quantity     numeric not null,
  unit_price   numeric not null,
  total_price  numeric not null,
  supplier     text    default '',
  created_at   timestamptz default now()
);

-- ── ZONAS DE ENTREGA ─────────────────────────────────────────
create table if not exists delivery_zones (
  id          text    primary key default gen_random_uuid()::text,
  name        text    not null,
  price       numeric not null default 0,
  description text    default '',
  created_at  timestamptz default now()
);

-- ── CÓDIGOS PROMOCIONAIS ─────────────────────────────────────
create table if not exists promo_codes (
  id             text    primary key default gen_random_uuid()::text,
  code           text    not null unique,
  discount_type  text    not null check (discount_type in ('percentage','fixed')),
  discount_value numeric not null,
  min_order      numeric default 0,
  uses           integer default 0,
  max_uses       integer,
  expires_at     timestamptz,
  active         boolean default true,
  created_at     timestamptz default now()
);

-- ── CONFIGURAÇÕES DA LOJA ────────────────────────────────────
create table if not exists store_settings (
  id                  integer primary key default 1 check (id = 1),
  name                text    default 'Peixaria Khrismir',
  phone               text    default '+244 929 970 984',
  whatsapp            text    default '244929970984',
  email               text    default 'khrismir@gmail.com',
  address             text    default 'Centralidade da Quilemba, Lubango',
  nif                 text    default '5001210092',
  iva_rate            numeric default 14,
  logo_url            text    default '',
  delivery_enabled    boolean default true,
  min_order_delivery  numeric default 0,
  opening_hours       text    default 'Seg–Sáb: 07:00–18:00',
  updated_at          timestamptz default now()
);
insert into store_settings (id) values (1) on conflict (id) do nothing;

-- ══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

alter table profiles       enable row level security;
alter table categories     enable row level security;
alter table products       enable row level security;
alter table orders         enable row level security;
alter table order_items    enable row level security;
alter table cash_flow      enable row level security;
alter table purchases      enable row level security;
alter table delivery_zones enable row level security;
alter table promo_codes    enable row level security;
alter table store_settings enable row level security;

-- PERFIS
create policy "perfil proprio" on profiles for all using (id = auth.uid());
create policy "admin ve todos perfis" on profiles for select
  using (current_user_role() in ('admin','employee'));
create policy "admin edita perfis" on profiles for update
  using (current_user_role() = 'admin');

-- CATEGORIAS (todos lêem, só staff escreve)
create policy "todos lêem categorias" on categories for select using (auth.role() = 'authenticated');
create policy "staff gere categorias" on categories for all
  using (current_user_role() in ('admin','employee'));

-- PRODUTOS
create policy "todos lêem produtos" on products for select using (auth.role() = 'authenticated');
create policy "staff gere produtos" on products for all
  using (current_user_role() in ('admin','employee'));

-- ENCOMENDAS
create policy "cliente vê as suas" on orders for select
  using (customer_id = auth.uid() or current_user_role() in ('admin','employee'));
create policy "cliente cria" on orders for insert
  with check (auth.role() = 'authenticated');
create policy "staff actualiza" on orders for update
  using (current_user_role() in ('admin','employee'));

-- ITENS (seguem a encomenda)
create policy "cliente lê itens" on order_items for select
  using (exists (
    select 1 from orders o where o.id = order_id
    and (o.customer_id = auth.uid() or current_user_role() in ('admin','employee'))
  ));
create policy "cria itens" on order_items for insert with check (auth.role() = 'authenticated');
create policy "staff edita itens" on order_items for all using (current_user_role() in ('admin','employee'));

-- FINANCEIRO / COMPRAS (só staff)
create policy "staff caixa" on cash_flow for all using (current_user_role() in ('admin','employee'));
create policy "staff compras" on purchases for all using (current_user_role() in ('admin','employee'));

-- ZONAS & PROMOS (todos lêem, só admin escreve)
create policy "todos lêem zonas" on delivery_zones for select using (auth.role() = 'authenticated');
create policy "admin gere zonas" on delivery_zones for all using (current_user_role() = 'admin');
create policy "todos lêem promos" on promo_codes for select using (auth.role() = 'authenticated');
create policy "admin gere promos" on promo_codes for all using (current_user_role() = 'admin');
create policy "atualiza usos promo" on promo_codes for update
  using (auth.role() = 'authenticated')
  with check (uses >= 0);

-- CONFIGURAÇÕES (todos lêem, só admin escreve)
create policy "todos lêem settings" on store_settings for select using (auth.role() = 'authenticated');
create policy "admin escreve settings" on store_settings for all using (current_user_role() = 'admin');

-- ══════════════════════════════════════════════════════════════
--  DADOS INICIAIS (produtos e categorias de demonstração)
-- ══════════════════════════════════════════════════════════════
insert into categories (id, name, description) values
  ('1', 'Pescado Fresco', 'Peixes frescos do dia'),
  ('2', 'Mariscos',       'Camarão, polvo, lulas'),
  ('3', 'Peixes Grandes', 'Peixes de maior porte')
on conflict (id) do nothing;

insert into products (id, name, price, unit, stock_quantity, min_stock, allow_whole, allow_clean, allow_fillet, allow_steak, category_id) values
  ('1', 'Sardinha',       1500, 'kg', 50, 10, true,  true,  false, false, '1'),
  ('2', 'Atum',           2500, 'kg', 30,  5, true,  true,  true,  true,  '1'),
  ('3', 'Pargo',          3000, 'kg', 20,  5, true,  true,  true,  true,  '1'),
  ('4', 'Camarão Grande', 4500, 'kg', 15,  3, true,  false, false, false, '2'),
  ('5', 'Polvo',          5000, 'kg', 10,  2, true,  false, false, false, '2'),
  ('6', 'Lingueirão',     3500, 'kg',  8,  2, true,  true,  false, false, '2')
on conflict (id) do nothing;

-- ══════════════════════════════════════════════════════════════
--  REALTIME — activar tabelas para subscriptions
-- ══════════════════════════════════════════════════════════════
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table
    orders, order_items, products, categories,
    delivery_zones, promo_codes, cash_flow, purchases;
commit;
