-- Tabela de licenças por dispositivo
-- Executar no SQL Editor do Supabase
create table if not exists licenses (
  id           text primary key,          -- device_id gerado no browser
  key          text not null,             -- chave no formato KHRIS-XXXX-YYYY-ZZZZ
  activated_at timestamptz not null,
  install_date timestamptz
);

-- Acesso público para leitura/escrita (a validação da chave é feita client-side)
alter table licenses enable row level security;

create policy "Dispositivo gere a própria licença"
  on licenses for all
  using (true)
  with check (true);
