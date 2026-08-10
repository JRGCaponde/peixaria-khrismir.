-- Turnos por funcionário: id de quem abriu, para deixar de ser um turno único partilhado por loja
alter table shift_sessions add column if not exists opened_by_id text;

-- src/lib/sync.ts já envia store_id no upsert de shift_sessions (pushAll e syncShifts),
-- mas a tabela original (missing_tables.sql) nunca teve esta coluna — garantir que existe.
alter table shift_sessions add column if not exists store_id text;
