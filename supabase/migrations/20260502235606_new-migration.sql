-- 1. Tabelas Base (Indispensáveis)
CREATE TABLE IF NOT EXISTS fornecedores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_empresa text NOT NULL,
  contacto text,
  criado_em timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categorias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  criado_em timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS produtos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  preco_venda numeric NOT NULL,
  unidade_medida text DEFAULT 'kg',
  stock_atual numeric DEFAULT 0,
  categoria_id uuid REFERENCES categorias(id),
  fornecedor_id uuid REFERENCES fornecedores(id),
  imagem_url text,
  criado_em timestamptz DEFAULT now()
);

-- 2. Restante das Tabelas
CREATE TABLE IF NOT EXISTS clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_completo text NOT NULL,
  telefone text,
  morada text,
  email text UNIQUE,
  criado_em timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid REFERENCES clientes(id),
  valor_total numeric NOT NULL,
  status text DEFAULT 'pendente',
  metodo_pagamento text,
  criado_em timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id uuid REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES produtos(id),
  quantidade numeric NOT NULL,
  preco_unitario numeric NOT NULL
);

-- 3. Agora sim, a VIEW (pois as tabelas já existem acima)
CREATE OR REPLACE VIEW relatorio_stock_baixo AS
SELECT 
    p.nome AS produto,
    p.stock_atual,
    p.unidade_medida,
    f.nome_empresa AS fornecedor,
    f.contacto AS contacto_fornecedor
FROM produtos p
JOIN fornecedores f ON p.fornecedor_id = f.id
WHERE p.stock_atual < 5;

-- 4. Funções e Triggers (Automação)
CREATE OR REPLACE FUNCTION atualizar_stock_apos_venda()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE produtos SET stock_atual = stock_atual - NEW.quantidade WHERE id = NEW.produto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_diminuir_stock
AFTER INSERT ON itens_pedido
FOR EACH ROW EXECUTE FUNCTION atualizar_stock_apos_venda();
