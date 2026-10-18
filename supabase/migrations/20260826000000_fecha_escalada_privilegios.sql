-- Fecha três falhas de escalada de privilégios encontradas na auditoria:
--
--   1) handle_new_user() copiava raw_user_meta_data->>'role' para profiles.role.
--      O "metadata" do signUp é escolhido por quem se regista — qualquer pessoa
--      com a chave pública (anon) podia chamar auth.signUp({ options: { data:
--      { role: 'super_admin' } } }) e ficar logo super_admin.
--   2) A política "utilizador actualiza o próprio perfil" (20260810190000)
--      deixa o próprio utilizador fazer UPDATE à sua linha inteira — incluindo
--      role, store_id e access_areas. Um cliente registado podia promover-se.
--      O mesmo vale para "utilizador cria o próprio perfil" (INSERT com o role
--      que quisesse, se a linha ainda não existisse).
--   3) reset_all_data() (SECURITY DEFINER, apaga quase tudo) tem EXECUTE para
--      qualquer "authenticated" — e o registo público de clientes está aberto,
--      por isso qualquer pessoa podia criar conta e apagar a base de dados.
--
-- Esta migração NÃO mexe em nenhuma política de leitura/escrita das tabelas de
-- negócio — isso está em 20260826010000_dados_internos_so_staff.sql, que é
-- independente e pode ser aplicada mais tarde.
--
-- Como a app continua a funcionar:
--   * Criar funcionário/gerente/admin (Admin → Equipa → createUser): o signUp
--     cria o perfil como 'client' e logo a seguir o admin (com sessão real)
--     faz update ao role — o trigger abaixo deixa passar porque quem altera é
--     admin/super_admin. NOTA: se esse update for feito por um gerente, passa a
--     falhar com "Só um administrador pode alterar..." (antes passava).
--   * Promoção manual no SQL Editor (update profiles set role = ... ) continua a
--     funcionar: o SQL Editor corre como "postgres", não como "anon"/"authenticated",
--     e o trigger só verifica pedidos vindos da API pública.
--   * Registo de clientes (Auth.tsx) e criação automática de perfil no login
--     (useAuthStore) já enviam role 'client' — não mudam.

-- ── 1) handle_new_user(): o papel é sempre 'client' ─────────────────────────
-- Recriada com o mesmo corpo de supabase/schema.sql, excepto o role, que deixa
-- de vir do metadata. Se profiles tiver a coluna "email" (a app usa-a, mas não
-- está no schema.sql do repositório), também a preenche — gerado dinamicamente
-- para nunca partir o signup por referir uma coluna que não exista.
do $$
declare
  tem_email boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  );
begin
  execute format($f$
    create or replace function public.handle_new_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $body$
    begin
      -- NUNCA ler o role de raw_user_meta_data: é controlado por quem se regista.
      -- Promoções fazem-se depois, por um admin ou no SQL Editor.
      insert into profiles (id, full_name, phone, role %1$s)
      values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', ''),
        coalesce(new.raw_user_meta_data->>'phone', ''),
        'client'
        %2$s
      )
      on conflict (id) do nothing;
      return new;
    end;
    $body$;
  $f$,
    case when tem_email then ', email' else '' end,
    case when tem_email then ', new.email' else '' end
  );
end $$;

-- ── 2) profiles: só admin/super_admin mudam role, store_id e access_areas ───
-- SECURITY INVOKER de propósito: "current_user" é então o papel do pedido.
-- Pedidos da API chegam como "anon" ou "authenticated"; o SQL Editor, o
-- service_role e funções SECURITY DEFINER (handle_new_user, reset_all_data)
-- chegam como outro papel e não são verificados aqui.
create or replace function public.profiles_protege_colunas_privilegiadas()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  quem text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  quem := coalesce(current_user_role(), '');

  if tg_op = 'INSERT' then
    -- Quem não é admin só pode criar o próprio perfil como cliente simples
    -- (mesmo comportamento que a app já tem: Auth.tsx e o login enviam 'client').
    if quem not in ('admin', 'super_admin') then
      new.role := 'client';
      new.access_areas := null;
    elsif new.role = 'super_admin' and quem <> 'super_admin' then
      raise exception 'Só um super_admin pode criar outro super_admin'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.role is distinct from old.role
     or new.store_id is distinct from old.store_id
     or new.access_areas is distinct from old.access_areas
  then
    if quem not in ('admin', 'super_admin') then
      raise exception 'Só um administrador pode alterar o papel, a loja ou as áreas de acesso de um perfil'
        using errcode = '42501';
    end if;
    -- Um admin não pode criar super_admins nem despromover um super_admin.
    if quem <> 'super_admin'
       and (new.role = 'super_admin' or old.role = 'super_admin')
       and new.role is distinct from old.role
    then
      raise exception 'Só um super_admin pode atribuir ou retirar o papel super_admin'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- A coluna store_id existe na base real (a app usa-a) mas não em schema.sql;
-- garante-a para o trigger nunca falhar por "record new has no field store_id".
alter table profiles add column if not exists store_id text;
alter table profiles add column if not exists access_areas text[];

drop trigger if exists profiles_protege_colunas_privilegiadas on profiles;
create trigger profiles_protege_colunas_privilegiadas
  before insert or update on profiles
  for each row execute function public.profiles_protege_colunas_privilegiadas();

-- ── 3) reset_all_data(): só admin/super_admin ───────────────────────────────
-- Mesmo corpo de 20260807223000_reset_all_data_full.sql, com a verificação de
-- papel no início. Chamado pela app em Admin → Sistema → "Apagar tudo"
-- (resetSupabase() em src/lib/sync.ts), que já só aparece a admins.
--
-- auth.role() é o papel do JWT do pedido ('anon' / 'authenticated' /
-- 'service_role'); no SQL Editor não há JWT (null) e a verificação não se
-- aplica — um dono do projecto continua a poder correr a função à mão.
create or replace function public.reset_all_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t text;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and coalesce(current_user_role(), '') not in ('admin', 'super_admin')
  then
    raise exception 'Sem permissão: só um administrador pode apagar todos os dados'
      using errcode = '42501';
  end if;

  foreach t in array array[
    'order_items', 'orders',
    'sale_items', 'sales', 'stock_entries', 'clients',
    'products', 'categories',
    'cash_flow', 'purchases', 'delivery_zones', 'promo_codes',
    'suppliers', 'returns', 'loyalty_transactions', 'shift_sessions',
    'cf_movements', 'cf_accounts', 'cf_categories',
    'profiles', 'stores'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from %I', t);
    end if;
  end loop;

  if to_regclass('public.store_settings') is not null then
    delete from store_settings;
    insert into store_settings (id) values (1) on conflict (id) do nothing;
  end if;
end;
$$;

-- "create or replace" mantém as permissões, mas reafirma-se o estado de
-- 20260825000000: nada para public/anon, só sessões autenticadas (e mesmo
-- essas são agora filtradas pela verificação acima).
revoke execute on function public.reset_all_data() from public;
revoke execute on function public.reset_all_data() from anon;
grant execute on function public.reset_all_data() to authenticated;

-- ── Verificação depois de aplicar (correr no SQL Editor) ───────────────────
-- 1) Nenhum perfil foi promovido por metadata antes desta correcção?
--      select p.id, p.email, p.role, u.raw_user_meta_data->>'role' as meta_role, p.created_at
--      from profiles p join auth.users u on u.id = p.id
--      where p.role <> 'client' order by p.created_at desc;
--    Qualquer admin/super_admin que não reconheça → update profiles set role='client' where id='...';
-- 2) select pg_get_functiondef('public.handle_new_user'::regproc);  -- não deve conter meta_data->>'role'
