import { supabase } from '../lib/supabase'

export async function registarVenda(clienteId: string, itens: { produto_id: string, quantidade: number, preco_unitario: number }[]) {
  // 1. Calcular o valor total da venda
  const valorTotal = itens.reduce((acc, item) => acc + (item.quantidade * item.preco_unitario), 0)

  // 2. Criar o Pedido (Cabeçalho)
  const { data: pedido, error: erroPedido } = await supabase
    .from('pedidos')
    .insert([{ 
      cliente_id: clienteId, 
      valor_total: valorTotal,
      status: 'pago' 
    }])
    .select()
    .single()

  if (erroPedido) throw erroPedido

  // 3. Criar os Itens do Pedido (Ligados ao ID do pedido acima)
  const itensFormatados = itens.map(item => ({
    pedido_id: pedido.id,
    produto_id: item.produto_id,
    quantidade: item.quantidade,
    preco_unitario: item.preco_unitario
  }))

  const { error: erroItens } = await supabase
    .from('itens_pedido')
    .insert(itensFormatados)

  if (erroItens) {
    // Se der erro aqui (ex: falta de stock), a base de dados avisa devido ao nosso Trigger!
    alert("Erro ao registar itens: " + erroItens.message)
    return null
  }

  return pedido
}
