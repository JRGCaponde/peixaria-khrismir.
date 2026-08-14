-- Limpeza de código morto identificada num levantamento completo do schema
-- (nenhuma destas tabelas/funções é chamada pela app nem por nenhuma política RLS activa).

-- Tabela do antigo sistema de "período de avaliação/licença", removido do código.
drop table if exists licenses;

-- Funções sem nenhuma chamada na app nem referência em políticas RLS.
-- (rls_auto_enable() NÃO entra aqui — está ligada ao event trigger "ensure_rls",
-- que activa RLS automaticamente em tabelas novas. Continua em uso, mantém-se.)
drop function if exists get_my_role();
drop function if exists get_my_store_id();
drop function if exists is_staff();
drop function if exists is_super_admin();
