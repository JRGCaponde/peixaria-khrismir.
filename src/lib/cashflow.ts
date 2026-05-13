/**
 * Camada de integração do Fluxo de Caixa.
 * Usada pelo POS e pelas Compras para registar movimentos automaticamente.
 */

import { format } from 'date-fns'
import { syncCfMovements, syncCfAccounts, deleteCfMovement } from './sync'
import { isSupabaseReady } from './supabase'

interface CFMovement {
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

interface CFAccount {
  id: string
  name: string
  balance: number
  type: 'cash' | 'bank' | 'mobile'
  color: string
}

function readMovements(): CFMovement[] {
  try { return JSON.parse(localStorage.getItem('cf_movements') || '[]') } catch { return [] }
}

function readAccounts(): CFAccount[] {
  try { return JSON.parse(localStorage.getItem('cf_accounts') || '[]') } catch { return [] }
}

function saveMovements(m: CFMovement[]) {
  localStorage.setItem('cf_movements', JSON.stringify(m))
}

function saveAccounts(a: CFAccount[]) {
  localStorage.setItem('cf_accounts', JSON.stringify(a))
}

/** Encontra a conta pelo tipo de pagamento do POS */
function accountForPayment(paymentType: string, accounts: CFAccount[]): string {
  if (accounts.length === 0) return 'Caixa'

  // Correspondência directa pelo tipo/nome da conta
  const lower = paymentType.toLowerCase()
  const match = accounts.find(a => {
    const n = a.name.toLowerCase()
    if (lower === 'dinheiro') return a.type === 'cash' || n.includes('caixa') || n.includes('dinheiro')
    if (lower === 'multicaixa') return n.includes('multicaixa') || a.type === 'bank'
    if (lower === 'express') return n.includes('express') || n.includes('mobile') || a.type === 'mobile'
    return false
  })

  return match?.name ?? accounts[0].name
}

/** Regista uma venda do POS no Fluxo de Caixa (usa ID determinístico baseado no orderId) */
export function registerSaleMovement(
  amount: number,
  orderNumber: string,
  paymentType: string,
  orderId?: string,
  chosenAccount?: string,
) {
  if (!amount || amount <= 0) return

  const accounts = readAccounts()
  const accountName = chosenAccount || accountForPayment(paymentType, accounts)
  const id = orderId ? `sync-sale-${orderId}` : `sale-${Date.now()}`

  const existing = readMovements()
  if (existing.some(m => m.id === id || m.reference === orderNumber)) return

  const movement: CFMovement = {
    id,
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'income',
    description: `Venda #${orderNumber}`,
    amount,
    category: 'Vendas',
    account: accountName,
    reference: orderNumber,
    created_at: new Date().toISOString(),
  }

  const updated = [movement, ...existing]
  saveMovements(updated)

  const idx = accounts.findIndex(a => a.name === accountName)
  if (idx !== -1) {
    accounts[idx].balance += amount
    saveAccounts(accounts)
    syncCfAccounts(accounts)
  }

  // Sincroniza o novo movimento para o Supabase imediatamente
  syncCfMovements([movement])
}

/** Regista uma compra/entrada de stock no Fluxo de Caixa (usa ID determinístico baseado no purchaseId) */
export function registerPurchaseMovement(
  amount: number,
  productName: string,
  supplier: string,
  accountName?: string,
  purchaseId?: string,
) {
  if (!amount || amount <= 0) return

  const accounts = readAccounts()
  const account = accountName ?? (accounts.find(a => a.type === 'cash')?.name ?? accounts[0]?.name ?? 'Caixa')
  const id = purchaseId ? `sync-pur-${purchaseId}` : `purchase-${Date.now()}`

  const existing = readMovements()
  if (existing.some(m => m.id === id)) return

  const movement: CFMovement = {
    id,
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'expense',
    description: `Compra: ${productName}${supplier ? ` — ${supplier}` : ''}`,
    amount,
    category: 'Fornecedores',
    account,
    created_at: new Date().toISOString(),
  }

  const updated = [movement, ...existing]
  saveMovements(updated)

  const idx = accounts.findIndex(a => a.name === account)
  if (idx !== -1) {
    accounts[idx].balance -= amount
    saveAccounts(accounts)
    syncCfAccounts(accounts)
  }

  // Sincroniza o novo movimento para o Supabase imediatamente
  syncCfMovements([movement])
}

/**
 * Migra dados existentes de khrismir_cashflow e khrismir_purchases para cf_movements.
 * Corre apenas uma vez (guarda flag em localStorage).
 * Retorna { imported, skipped } com a contagem de registos.
 */
export function migrateExistingData(force = false): { imported: number; skipped: number } {
  const FLAG = 'cf_migration_done_v1'
  if (!force && localStorage.getItem(FLAG) === '1') return { imported: 0, skipped: 0 }

  const existing   = readMovements()
  const existingIds = new Set(existing.map(m => m.id))
  const accounts   = readAccounts()
  const defaultAccount = accounts.find(a => a.type === 'cash')?.name ?? accounts[0]?.name ?? 'Caixa'

  const toAdd: CFMovement[] = []

  // ── 1. khrismir_cashflow → cf_movements ──────────────────────
  const oldCF: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_cashflow') || '[]') } catch { return [] } })()
  for (const cf of oldCF) {
    const id = `migcf-${cf.id}`
    if (existingIds.has(id)) continue

    const payType = cf.payment_type || 'dinheiro'
    const account = accountForPayment(payType, accounts)
    const dateStr = cf.created_at ? format(new Date(cf.created_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')

    toAdd.push({
      id,
      date: dateStr,
      type: cf.type === 'entrada' ? 'income' : 'expense',
      description: cf.description || (cf.type === 'entrada' ? 'Entrada' : 'Saída'),
      amount: Number(cf.amount) || 0,
      category: cf.type === 'entrada' ? 'Vendas' : 'Outros',
      account,
      reference: cf.order_number || undefined,
      created_at: cf.created_at || new Date().toISOString(),
    })
  }

  // ── 2. khrismir_purchases → cf_movements ─────────────────────
  const products: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_products') || '[]') } catch { return [] } })()
  const oldPur: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_purchases') || '[]') } catch { return [] } })()

  for (const pur of oldPur) {
    const id = `migpur-${pur.id}`
    if (existingIds.has(id)) continue
    const amount = Number(pur.total_price)
    if (!amount || amount <= 0) continue

    const productName = products.find((p: any) => p.id === pur.product_id)?.name || 'Produto'
    const dateStr = pur.created_at ? format(new Date(pur.created_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')

    toAdd.push({
      id,
      date: dateStr,
      type: 'expense',
      description: `Compra: ${productName}${pur.supplier ? ` — ${pur.supplier}` : ''}`,
      amount,
      category: 'Fornecedores',
      account: defaultAccount,
      created_at: pur.created_at || new Date().toISOString(),
    })
  }

  if (toAdd.length > 0) {
    // Combina e ordena por data decrescente
    const merged = [...toAdd, ...existing].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    saveMovements(merged)
  }

  localStorage.setItem(FLAG, '1')
  return { imported: toAdd.length, skipped: oldCF.length + oldPur.length - toAdd.length }
}

/**
 * Sincroniza todos os pedidos e compras existentes para cf_movements.
 * Idempotente — usa IDs determinísticos (sync-sale-{id}, sync-pur-{id}).
 * Corre sempre que chamada, sem flags de migração.
 */
export function syncAllData(): void {
  const movements   = readMovements()
  const existingIds = new Set(movements.map(m => m.id))
  const existingRefs = new Set(movements.filter(m => m.reference).map(m => m.reference as string))
  const accounts    = readAccounts()
  const defaultAcc  = accounts.find(a => a.type === 'cash')?.name ?? accounts[0]?.name ?? 'Caixa'

  const toAdd: CFMovement[] = []

  // ── Pedidos (vendas) ────────────────────────────────────────────
  const orders: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_orders') || '[]') } catch { return [] } })()
  for (const order of orders) {
    if (order.status === 'cancelado') continue
    const id = `sync-sale-${order.id}`
    if (existingIds.has(id) || existingRefs.has(order.order_number)) continue
    const amount = Number(order.total)
    if (!amount || amount <= 0) continue

    const accountName = accountForPayment(order.payment_type || 'dinheiro', accounts)
    const dateStr = order.created_at ? format(new Date(order.created_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')

    toAdd.push({
      id,
      date: dateStr,
      type: 'income',
      description: `Venda #${order.order_number}${order.customer_name ? ` — ${order.customer_name}` : ''}`,
      amount,
      category: 'Vendas',
      account: accountName,
      reference: order.order_number,
      created_at: order.created_at || new Date().toISOString(),
    })
  }

  // ── Compras / entradas de stock ─────────────────────────────────
  const products: any[]  = (() => { try { return JSON.parse(localStorage.getItem('khrismir_products') || '[]') } catch { return [] } })()
  const purchases: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_purchases') || '[]') } catch { return [] } })()
  for (const pur of purchases) {
    const id = `sync-pur-${pur.id}`
    if (existingIds.has(id) || existingIds.has(`migpur-${pur.id}`)) continue
    const amount = Number(pur.total_price)
    if (!amount || amount <= 0) continue

    const productName = products.find((p: any) => p.id === pur.product_id)?.name || 'Produto'
    const dateStr = pur.created_at ? format(new Date(pur.created_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')

    toAdd.push({
      id,
      date: dateStr,
      type: 'expense',
      description: `Compra: ${productName}${pur.supplier ? ` — ${pur.supplier}` : ''}`,
      amount,
      category: 'Fornecedores',
      account: defaultAcc,
      created_at: pur.created_at || new Date().toISOString(),
    })
  }

  if (toAdd.length > 0) {
    const merged = [...toAdd, ...movements].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    saveMovements(merged)
    // Sincroniza os novos movimentos para o Supabase
    syncCfMovements(toAdd)
  }
}

/**
 * Remove do localStorage (e do Supabase) todos os movimentos com amount <= 0.
 * Retorna o número de registos eliminados.
 */
export function purgeZeroMovements(): number {
  const all  = readMovements()
  const keep = all.filter(m => m.amount > 0)
  const dead = all.filter(m => m.amount <= 0)

  if (dead.length === 0) return 0

  saveMovements(keep)

  if (isSupabaseReady()) {
    dead.forEach(m => deleteCfMovement(m.id))
  }

  return dead.length
}

/** Retorna um resumo rápido para mostrar no Admin */
export function getCashFlowSummary() {
  const movements = readMovements()
  const accounts  = readAccounts()
  const today     = format(new Date(), 'yyyy-MM-dd')
  const thisMonth = format(new Date(), 'yyyy-MM')

  const totalBalance   = accounts.reduce((s, a) => s + a.balance, 0)
  const todayIncome    = movements.filter(m => m.date === today && m.type === 'income').reduce((s, m) => s + m.amount, 0)
  const todayExpense   = movements.filter(m => m.date === today && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
  const monthIncome    = movements.filter(m => m.date.startsWith(thisMonth) && m.type === 'income').reduce((s, m) => s + m.amount, 0)
  const monthExpense   = movements.filter(m => m.date.startsWith(thisMonth) && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
  const recentSales    = movements.filter(m => m.category === 'Vendas').slice(0, 5)
  const recentExpenses = movements.filter(m => m.type === 'expense').slice(0, 5)

  return { totalBalance, todayIncome, todayExpense, monthIncome, monthExpense, recentSales, recentExpenses, accounts }
}
