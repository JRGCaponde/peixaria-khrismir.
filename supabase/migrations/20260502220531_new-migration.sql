-- 1. FORNECEDORES
CREATE TABLE fornecedores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_empresa text NOT NULL,
  contacto text,
  criado_em timestamptz DEFAULT now()
);

-- 2. CATEGORIAS
CREATE TABLE categorias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  criado_em timestamptz DEFAULT now()
);

-- 3. PRODUTOS (Com suporte a KG ou Unidade)
CREATE TABLE produtos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  preco_venda numeric NOT NULL,
  unidade_medida text DEFAULT 'kg', -- 'kg' ou 'un'
  stock_atual numeric DEFAULT 0,
  categoria_id uuid REFERENCES categorias(id),
  fornecedor_id uuid REFERENCES fornecedores(id),
  imagem_url text,
  criado_em timestamptz DEFAULT now()
);

-- 4. CLIENTES
CREATE TABLE clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_completo text NOT NULL,
  telefone text,
  morada text,
  email text UNIQUE,
  criado_em timestamptz DEFAULT now()
);

-- 5. PEDIDOS (Vendas)
CREATE TABLE pedidos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid REFERENCES clientes(id),
  valor_total numeric NOT NULL,
  status text DEFAULT 'pendente', -- 'pendente', 'pago', 'entregue', 'cancelado'
  metodo_pagamento text,
  criado_em timestamptz DEFAULT now()
);

-- 6. ITENS DO PEDIDO (O que foi comprado em cada pedido)
CREATE TABLE itens_pedido (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id uuid REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES produtos(id),
  quantidade numeric NOT NULL,
  preco_unitario numeric NOT NULL
);

-- 1. Criar a função de validação de stock
CREATE OR REPLACE FUNCTION validar_stock_disponivel()
RETURNS TRIGGER AS $$
DECLARE
    stock_disponivel numeric;
BEGIN
    -- Procurar o stock atual do produto
    SELECT stock_atual INTO stock_disponivel 
    FROM produtos 
    WHERE id = NEW.produto_id;

    -- Se o stock for insuficiente, trava a inserção e mostra erro
    IF stock_disponivel < NEW.quantidade THEN
        RAISE EXCEPTION 'Stock insuficiente para o produto solicitado. Disponível: %', stock_disponivel;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Criar o Trigger que corre ANTES da venda ser registada
CREATE TRIGGER tr_verificar_stock_antes_venda
BEFORE INSERT ON itens_pedido
FOR EACH ROW
EXECUTE FUNCTION validar_stock_disponivel();
