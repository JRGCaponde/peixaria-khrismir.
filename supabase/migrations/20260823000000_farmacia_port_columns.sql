-- Colunas trazidas da app irmã (Farmácia Boa Saúde) durante a portagem de melhorias genéricas
alter table products add column if not exists discount numeric default 0;
alter table store_settings add column if not exists tagline text;
alter table store_settings add column if not exists description text;
