-- "Database error saving new user" ao criar contas de funcionário/gerente/cliente:
-- a trigger handle_new_user() (SECURITY DEFINER) corre com um search_path que não
-- inclui "public", pelo que "insert into profiles (...)" falhava com
-- "relation \"profiles\" does not exist" (SQLSTATE 42P01), abortando a transacção
-- inteira do signup no auth.users. Fixar o search_path resolve sem alterar a
-- lógica da função.

alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.auto_confirm_user_email() set search_path = public, auth, pg_temp;
