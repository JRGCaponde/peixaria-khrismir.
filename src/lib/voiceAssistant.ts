import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { pt } from 'date-fns/locale'
import type { Order, Product, Purchase } from '../types/database'

interface CashMovement {
  id: string
  date: string
  type: 'income' | 'expense' | 'transfer'
  description: string
  amount: number
  category: string
  account: string
  accountTo?: string
  reference?: string
  created_at: string
}

interface Account {
  id: string
  name: string
  balance: number
  type: 'cash' | 'bank' | 'mobile'
  color: string
}

function ls<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('pt-AO') + ' Kz'
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia, chefe!'
  if (h < 18) return 'Boa tarde, chefe!'
  return 'Boa noite, chefe!'
}

function buildContext(): string {
  const orders: Order[] = ls('khrismir_orders', [])
  const products: Product[] = ls('khrismir_products', [])
  const purchases: Purchase[] = ls('khrismir_purchases', [])
  const movements: CashMovement[] = ls('cf_movements', [])
  const accounts: Account[] = ls('cf_accounts', [])

  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')

  const todayMov = movements.filter(m => m.date === today)
  const yesterdayMov = movements.filter(m => m.date === yesterday)
  const weekMov = movements.filter(m => m.date >= weekStart && m.date <= weekEnd)
  const monthMov = movements.filter(m => m.date >= monthStart && m.date <= monthEnd)

  const sum = (arr: CashMovement[], type: string) => arr.filter(m => m.type === type).reduce((s, m) => s + m.amount, 0)

  const pendingOrders = orders.filter(o => o.status === 'pendente')
  const preparingOrders = orders.filter(o => o.status === 'preparando')
  const readyOrders = orders.filter(o => o.status === 'pronto')
  const lowStock = products.filter(p => p.stock_quantity <= p.min_stock)

  const productSales: Record<string, { name: string; qty: number; total: number }> = {}
  orders.filter(o => o.status !== 'cancelado').forEach(o => {
    (o.items || []).forEach(it => {
      if (!productSales[it.product_name]) productSales[it.product_name] = { name: it.product_name, qty: 0, total: 0 }
      productSales[it.product_name].qty += it.quantity
      productSales[it.product_name].total += it.total_price
    })
  })
  const topProducts = Object.values(productSales).sort((a, b) => b.total - a.total).slice(0, 5)

  const todayPurchases = purchases.filter(p => p.date === today)
  const monthPurchases = purchases.filter(p => p.date >= monthStart && p.date <= monthEnd)

  const expByCategory: Record<string, number> = {}
  monthMov.filter(m => m.type === 'expense').forEach(m => { expByCategory[m.category] = (expByCategory[m.category] || 0) + m.amount })

  return `Data de hoje: ${format(new Date(), 'dd/MM/yyyy (EEEE)', { locale: pt })}
Hora: ${format(new Date(), 'HH:mm')}

=== VENDAS ===
Hoje: receita ${fmt(sum(todayMov, 'income'))}, despesas ${fmt(sum(todayMov, 'expense'))}, lucro ${fmt(sum(todayMov, 'income') - sum(todayMov, 'expense'))}
Ontem: receita ${fmt(sum(yesterdayMov, 'income'))}, despesas ${fmt(sum(yesterdayMov, 'expense'))}
Semana: receita ${fmt(sum(weekMov, 'income'))}, despesas ${fmt(sum(weekMov, 'expense'))}, lucro ${fmt(sum(weekMov, 'income') - sum(weekMov, 'expense'))}
Mês: receita ${fmt(sum(monthMov, 'income'))}, despesas ${fmt(sum(monthMov, 'expense'))}, lucro ${fmt(sum(monthMov, 'income') - sum(monthMov, 'expense'))}
Total de pedidos (histórico): ${orders.length}

=== CONTAS / SALDO ===
${accounts.length > 0 ? accounts.map(a => `${a.name} (${a.type}): ${fmt(a.balance)}`).join('\n') : 'Sem contas configuradas'}
Saldo total: ${fmt(accounts.reduce((s, a) => s + a.balance, 0))}

=== PEDIDOS ACTIVOS ===
Pendentes: ${pendingOrders.length}
Em preparação: ${preparingOrders.length}
Prontos para entrega: ${readyOrders.length}

=== PRODUTOS (${products.length} total) ===
Com stock: ${products.filter(p => p.stock_quantity > 0).length}
Stock baixo: ${lowStock.length > 0 ? lowStock.map(p => `${p.name} (${p.stock_quantity} ${p.unit}, mín: ${p.min_stock})`).join(', ') : 'Nenhum'}
Produtos: ${products.slice(0, 15).map(p => `${p.name}: ${fmt(p.price)}/${p.unit}, stock: ${p.stock_quantity}`).join('; ')}

=== TOP PRODUTOS MAIS VENDIDOS ===
${topProducts.length > 0 ? topProducts.map((p, i) => `${i + 1}. ${p.name}: ${fmt(p.total)} (${p.qty} unid.)`).join('\n') : 'Sem dados'}

=== COMPRAS ===
Hoje: ${todayPurchases.length} compras, total ${fmt(todayPurchases.reduce((s, p) => s + p.total, 0))}
Mês: ${monthPurchases.length} compras, total ${fmt(monthPurchases.reduce((s, p) => s + p.total, 0))}

=== DESPESAS POR CATEGORIA (mês) ===
${Object.entries(expByCategory).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}: ${fmt(v)}`).join(', ') || 'Sem despesas'}`
}

// --- CLAUDE API (online) ---
export async function askClaude(question: string): Promise<string> {
  const context = buildContext()
  const res = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context })
  })
  if (!res.ok) throw new Error('API error')
  const data = await res.json()
  return data.answer
}

// --- MOTOR LOCAL (offline fallback) ---
export function processQuestion(raw: string): string {
  const q = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

  const orders: Order[] = ls('khrismir_orders', [])
  const products: Product[] = ls('khrismir_products', [])
  const purchases: Purchase[] = ls('khrismir_purchases', [])
  const movements: CashMovement[] = ls('cf_movements', [])
  const accounts: Account[] = ls('cf_accounts', [])

  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const monthName = format(new Date(), 'MMMM', { locale: pt })

  if (/^(ola|oi|hey|bom dia|boa tarde|boa noite|e ai|tudo bem)/.test(q)) {
    const todayIncome = movements.filter(m => m.date === today && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const pendingOrders = orders.filter(o => o.status === 'pendente').length
    let msg = getGreeting()
    if (todayIncome > 0) msg += ` Hoje já faturámos ${fmt(todayIncome)}.`
    if (pendingOrders > 0) msg += ` Tens ${pendingOrders} pedido${pendingOrders > 1 ? 's' : ''} pendente${pendingOrders > 1 ? 's' : ''}.`
    if (todayIncome === 0 && pendingOrders === 0) msg += ' Ainda sem movimentos hoje.'
    return msg
  }

  if (/(vendas?|faturamento|faturou|faturamos|vendeu|vendemos|receita).*(hoje|do dia|de hoje|diaria)/.test(q) ||
      /(hoje|do dia).*(vendas?|faturamento|faturou|vendeu|receita)/.test(q) ||
      /como (foram|estao|estiveram|esta).*(vendas|as coisas)/.test(q) ||
      /como.*foi.*(dia|hoje)/.test(q)) {
    const todayIncome = movements.filter(m => m.date === today && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const todayExpense = movements.filter(m => m.date === today && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    const todayOrders = orders.filter(o => o.created_at?.startsWith(today)).length
    if (todayIncome === 0) return 'Hoje ainda não houve vendas registadas.'
    let msg = `Hoje faturámos ${fmt(todayIncome)}`
    if (todayOrders > 0) msg += ` com ${todayOrders} pedido${todayOrders > 1 ? 's' : ''}`
    msg += '.'
    if (todayExpense > 0) msg += ` Despesas: ${fmt(todayExpense)}. Lucro líquido: ${fmt(todayIncome - todayExpense)}.`
    return msg
  }

  if (/(vendas?|faturamento|faturou|vendeu|receita).*(ontem)/.test(q) || /ontem.*(vendas?|faturou|vendeu)/.test(q)) {
    const yIncome = movements.filter(m => m.date === yesterday && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const yExpense = movements.filter(m => m.date === yesterday && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    if (yIncome === 0) return 'Ontem não houve vendas registadas.'
    let msg = `Ontem faturámos ${fmt(yIncome)}.`
    if (yExpense > 0) msg += ` Despesas: ${fmt(yExpense)}. Lucro: ${fmt(yIncome - yExpense)}.`
    return msg
  }

  if (/(vendas?|faturamento|receita).*(semana|semanal)/.test(q) || /(semana|semanal).*(vendas?|faturamento|receita)/.test(q)) {
    const wIncome = movements.filter(m => m.date >= weekStart && m.date <= weekEnd && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const wExpense = movements.filter(m => m.date >= weekStart && m.date <= weekEnd && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    if (wIncome === 0) return 'Esta semana ainda sem vendas registadas.'
    return `Esta semana: receita de ${fmt(wIncome)}, despesas de ${fmt(wExpense)}, lucro de ${fmt(wIncome - wExpense)}.`
  }

  if (/(vendas?|faturamento|receita).*(mes|mensal)/.test(q) || /(mes|mensal).*(vendas?|faturamento|receita)/.test(q) || /quanto.*faturamos.*(mes|mensal)/.test(q)) {
    const mIncome = movements.filter(m => m.date >= monthStart && m.date <= monthEnd && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const mExpense = movements.filter(m => m.date >= monthStart && m.date <= monthEnd && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    const mOrders = orders.filter(o => o.created_at >= monthStart).length
    let msg = `Em ${monthName}: receita total de ${fmt(mIncome)}`
    if (mOrders > 0) msg += ` em ${mOrders} pedidos`
    msg += '.'
    if (mExpense > 0) msg += ` Despesas: ${fmt(mExpense)}. Lucro: ${fmt(mIncome - mExpense)}.`
    return msg
  }

  if (/(despesa|gasto|gastos|gastou|gastamos|custo).*(hoje|do dia)/.test(q) || /(hoje|do dia).*(despesa|gasto|gastos|custo)/.test(q)) {
    const todayExp = movements.filter(m => m.date === today && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    if (todayExp === 0) return 'Hoje não há despesas registadas.'
    const cats: Record<string, number> = {}
    movements.filter(m => m.date === today && m.type === 'expense').forEach(m => { cats[m.category] = (cats[m.category] || 0) + m.amount })
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c}: ${fmt(v)}`).join(', ')
    return `Despesas de hoje: ${fmt(todayExp)}. Maiores: ${top}.`
  }

  if (/(despesa|gasto|gastos|custo).*(mes|mensal)/.test(q) || /(mes|mensal).*(despesa|gasto|gastos|custo)/.test(q)) {
    const mExp = movements.filter(m => m.date >= monthStart && m.date <= monthEnd && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    if (mExp === 0) return `Sem despesas registadas em ${monthName}.`
    return `Despesas de ${monthName}: ${fmt(mExp)}.`
  }

  if (/(lucro|lucros|ganho|ganhos|resultado|margem).*(hoje|do dia)/.test(q) || /(hoje|do dia).*(lucro|ganho|resultado)/.test(q)) {
    const inc = movements.filter(m => m.date === today && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const exp = movements.filter(m => m.date === today && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    if (inc === 0) return 'Sem movimentos hoje para calcular lucro.'
    return `Lucro de hoje: ${fmt(inc - exp)}. Receita: ${fmt(inc)}, despesas: ${fmt(exp)}.`
  }

  if (/(lucro|lucros|ganho|resultado|margem).*(mes|mensal)/.test(q) || /(mes|mensal).*(lucro|ganho|resultado)/.test(q)) {
    const inc = movements.filter(m => m.date >= monthStart && m.date <= monthEnd && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const exp = movements.filter(m => m.date >= monthStart && m.date <= monthEnd && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    return `Lucro de ${monthName}: ${fmt(inc - exp)}. Receita: ${fmt(inc)}, despesas: ${fmt(exp)}.`
  }

  if (/(saldo|caixa|dinheiro|quanto.*tem|balance)/.test(q)) {
    if (accounts.length === 0) return 'Ainda não tens contas configuradas no sistema de caixa.'
    const total = accounts.reduce((s, a) => s + a.balance, 0)
    const detail = accounts.map(a => `${a.name}: ${fmt(a.balance)}`).join(', ')
    return `Saldo total: ${fmt(total)}. ${detail}.`
  }

  if (/(stock|estoque|inventario|produtos?.*acabar|acabando|em falta|ruptura|minimo)/.test(q)) {
    const lowStock = products.filter(p => p.stock_quantity <= p.min_stock && p.stock_quantity >= 0)
    if (lowStock.length === 0) return 'Todos os produtos estão com stock acima do mínimo. Tudo em ordem!'
    const list = lowStock.slice(0, 5).map(p => `${p.name} (${p.stock_quantity} ${p.unit})`).join(', ')
    return `${lowStock.length} produto${lowStock.length > 1 ? 's' : ''} com stock baixo: ${list}.`
  }

  if (/(quantos? produtos?|total.*produtos?)/.test(q)) {
    return `Tens ${products.length} produtos cadastrados, com ${products.filter(p => p.stock_quantity > 0).length} em stock.`
  }

  if (/(quanto.*custa|preco|preço).+/.test(q)) {
    const match = q.match(/(?:quanto.*custa|preco|preço)\s+(?:d[aoe]s?\s+)?(.+)/)
    if (match) {
      const name = match[1].trim()
      const found = products.find(p => p.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(name))
      if (found) return `${found.name} custa ${fmt(found.price)} por ${found.unit}. Stock: ${found.stock_quantity} ${found.unit}.`
      return `Não encontrei nenhum produto chamado "${name}".`
    }
  }

  if (/(produto.*mais.*vendido|mais.*vendeu|top.*produto|campeao.*vendas?)/.test(q)) {
    const productSales: Record<string, { name: string; qty: number; total: number }> = {}
    orders.filter(o => o.status !== 'cancelado').forEach(o => {
      (o.items || []).forEach(it => {
        if (!productSales[it.product_name]) productSales[it.product_name] = { name: it.product_name, qty: 0, total: 0 }
        productSales[it.product_name].qty += it.quantity
        productSales[it.product_name].total += it.total_price
      })
    })
    const sorted = Object.values(productSales).sort((a, b) => b.total - a.total)
    if (sorted.length === 0) return 'Ainda sem dados de vendas para determinar o produto mais vendido.'
    const top3 = sorted.slice(0, 3).map((p, i) => `${i + 1}. ${p.name} — ${fmt(p.total)}`).join('; ')
    return `Produtos mais vendidos: ${top3}.`
  }

  if (/(compras?|comprou|compramos|fornecedor).*(hoje|do dia)/.test(q) || /(hoje|do dia).*(compras?)/.test(q)) {
    const todayPurchases = purchases.filter(p => p.date === today)
    const total = todayPurchases.reduce((s, p) => s + p.total, 0)
    if (todayPurchases.length === 0) return 'Sem compras registadas hoje.'
    return `Hoje: ${todayPurchases.length} compra${todayPurchases.length > 1 ? 's' : ''} no total de ${fmt(total)}.`
  }

  if (/(compras?|comprou|compramos|fornecedor).*(mes|mensal)/.test(q) || /(mes|mensal).*(compras?)/.test(q)) {
    const mPurchases = purchases.filter(p => p.date >= monthStart && p.date <= monthEnd)
    const total = mPurchases.reduce((s, p) => s + p.total, 0)
    if (mPurchases.length === 0) return `Sem compras registadas em ${monthName}.`
    return `Em ${monthName}: ${mPurchases.length} compras, total de ${fmt(total)}.`
  }

  if (/(pedido|pedidos|encomenda).*(pendente|aberto|por fazer|em espera)/.test(q) || /(pendente|aberto).*(pedido|encomenda)/.test(q) || /quantos? pedidos?/.test(q)) {
    const pending = orders.filter(o => o.status === 'pendente')
    const preparing = orders.filter(o => o.status === 'preparando')
    const ready = orders.filter(o => o.status === 'pronto')
    let msg = ''
    if (pending.length > 0) msg += `${pending.length} pendente${pending.length > 1 ? 's' : ''}. `
    if (preparing.length > 0) msg += `${preparing.length} em preparação. `
    if (ready.length > 0) msg += `${ready.length} pronto${ready.length > 1 ? 's' : ''} para entrega. `
    if (!msg) return 'Não há pedidos pendentes. Tudo em dia!'
    return `Pedidos activos: ${msg.trim()}`
  }

  if (/(resumo|relatorio|dashboard|panorama|visao geral|como.*esta.*loja|estado.*loja)/.test(q)) {
    const todayInc = movements.filter(m => m.date === today && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const todayExp = movements.filter(m => m.date === today && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    const monthInc = movements.filter(m => m.date >= monthStart && m.date <= monthEnd && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const monthExp = movements.filter(m => m.date >= monthStart && m.date <= monthEnd && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    const pending = orders.filter(o => o.status === 'pendente').length
    const lowStock = products.filter(p => p.stock_quantity <= p.min_stock).length
    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
    let msg = `Resumo: Hoje faturámos ${fmt(todayInc)}, gastámos ${fmt(todayExp)}.`
    msg += ` No mês: ${fmt(monthInc)} de receita, ${fmt(monthExp)} de despesa, lucro de ${fmt(monthInc - monthExp)}.`
    if (totalBalance > 0) msg += ` Saldo total: ${fmt(totalBalance)}.`
    if (pending > 0) msg += ` ${pending} pedido${pending > 1 ? 's' : ''} pendente${pending > 1 ? 's' : ''}.`
    if (lowStock > 0) msg += ` Atenção: ${lowStock} produto${lowStock > 1 ? 's' : ''} com stock baixo.`
    return msg
  }

  if (/(ajuda|o que.*pode|o que.*sabe|comandos|funcoes|funcionalidades)/.test(q)) {
    return 'Podes perguntar-me sobre: vendas de hoje, ontem, da semana ou do mês. Despesas e lucros. Saldo das contas. Stock e produtos. Pedidos pendentes. Produto mais vendido. Preço de um produto. Compras. Ou pedir um resumo geral!'
  }

  return `Desculpa, não entendi a pergunta. Experimenta perguntar sobre vendas, despesas, lucro, stock, pedidos ou saldo. Ou diz "ajuda" para ver tudo o que sei fazer!`
}

export function speak(text: string, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) {
    onEnd?.()
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'pt-PT'
  utterance.rate = 1.05
  utterance.pitch = 1.0

  const voices = window.speechSynthesis.getVoices()
  const ptVoice = voices.find(v => v.lang?.startsWith('pt'))
  if (ptVoice) utterance.voice = ptVoice

  if (onEnd) utterance.onend = () => onEnd()
  window.speechSynthesis.speak(utterance)
}
