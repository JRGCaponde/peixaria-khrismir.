-- syncSettings() envia o objecto StoreSettings inteiro — várias colunas usadas
-- pela app (dados fiscais/bancários para as facturas) nunca chegaram a ser
-- criadas em store_settings. Adiciona todas de uma vez para não irmos
-- descobrindo uma a uma a cada sincronização.
alter table store_settings add column if not exists logo_url text;
alter table store_settings add column if not exists capital_social text;
alter table store_settings add column if not exists cons_reg_com text;
alter table store_settings add column if not exists bank_name text;
alter table store_settings add column if not exists bank_account text;
alter table store_settings add column if not exists bank_iban text;
