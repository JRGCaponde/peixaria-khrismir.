-- "Conta criada mas o perfil falhou a gravar: Could not find the 'access_areas'
-- column of 'profiles'" — a tabela profiles nunca ganhou esta coluna, usada para
-- guardar quais separadores do Admin um Gerente pode aceder.

alter table profiles add column if not exists access_areas text[];
