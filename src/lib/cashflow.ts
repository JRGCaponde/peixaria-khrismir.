/**
 * Camada de integração do Fluxo de Caixa.
 * Usada pelo POS e pelas Compras para registar movimentos automaticamente.
 */

import { format } from 'date-fns'
import { syncCfMovements, syncCfAccounts, deleteCfMovement } from './sync'
import { isSupabaseReady } from './supabase'
import { getSettings } from './settings'
import {
  postAutoEntryForSale, postAutoEntryForPurchase, postAutoEntryForMovement, removeJournalEntry,
  postCreditEntryForSale, postCreditEntryForPurchase, postSettlementForSale, postSettlementForPurchase,
} from './accounting'

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

/** Mapeia o tipo de conta do Fluxo de Caixa para a conta PGC-AO correspondente (11 Caixa, 12 Depósitos à Ordem) */
function cashAccountCode(accountName: string, accounts: CFAccount[]): string {
  const acc = accounts.find(a => a.name === accountName)
  return acc?.type === 'cash' ? '11' : '12'
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

  // Lançamento contabilístico (partidas dobradas) — idempotente, não bloqueia a venda
  // Usa o orderId (não o id do movimento) — é o que cancelSaleMovement()/
  // reconcileCancelledSales() esperam encontrar em auto-venda-{orderId}.
  try {
    postAutoEntryForSale(orderId ?? id, orderNumber, amount, getSettings().iva_rate, cashAccountCode(accountName, accounts), movement.date)
  } catch { /* não bloqueia a venda por falha na contabilidade */ }
}

/**
 * Anula o movimento de caixa e o lançamento contabilístico de uma venda cancelada
 * (o inverso de registerSaleMovement) — uma encomenda cancelada deixa de contar
 * como venda em Caixa e Contabilidade.
 */
export function cancelSaleMovement(orderId: string) {
  const id = `sync-sale-${orderId}`
  const movements = readMovements()
  const movement = movements.find(m => m.id === id)

  if (movement) {
    saveMovements(movements.filter(m => m.id !== id))
    deleteCfMovement(id)

    const accounts = readAccounts()
    const idx = accounts.findIndex(a => a.name === movement.account)
    if (idx !== -1) {
      accounts[idx].balance -= movement.amount
      saveAccounts(accounts)
      syncCfAccounts(accounts)
    }
  }

  // Tenta sempre remover o lançamento contabilístico, mesmo que o movimento de
  // caixa já não exista (ex: já tinha sido removido antes) — evita ficar
  // "meio anulado", com a venda ainda a contar na Contabilidade.
  removeJournalEntry(`auto-venda-${orderId}`)
  // Vendas registadas antes desta correcção ficaram com o id trocado
  // (auto-venda-sync-sale-{orderId} em vez de auto-venda-{orderId}) — tenta
  // remover também esse padrão antigo, para não deixar histórico órfão.
  removeJournalEntry(`auto-venda-sync-sale-${orderId}`)
}

/**
 * Venda a crédito (fiado) — regista o proveito na Contabilidade (Débito 32
 * Clientes) mas NÃO cria movimento de caixa: o dinheiro só entra quando
 * settleReceivable() for chamado (ver Contas a Pagar/Receber no Admin).
 */
export function registerCreditSale(orderId: string, orderNumber: string, amount: number) {
  if (!amount || amount <= 0) return
  try {
    postCreditEntryForSale(orderId, orderNumber, amount, getSettings().iva_rate, format(new Date(), 'yyyy-MM-dd'))
  } catch { /* não bloqueia a venda por falha na contabilidade */ }
}

/**
 * Liquidação de uma venda a crédito — o cliente pagou. Só agora entra o
 * dinheiro em Caixa (mesmo id de movimento que uma venda normal, `sync-sale-{id}`
 * — passa a comportar-se como uma venda normal a partir daqui) e regista-se o
 * lançamento de liquidação (não volta a reconhecer receita).
 */
export function settleReceivable(orderId: string, orderNumber: string, amount: number, accountName: string) {
  const accounts = readAccounts()
  const id = `sync-sale-${orderId}`
  const existing = readMovements()
  if (existing.some(m => m.id === id)) return // já liquidada

  const movement: CFMovement = {
    id, date: format(new Date(), 'yyyy-MM-dd'), type: 'income',
    description: `Recebimento — Venda #${orderNumber}`, amount, category: 'Vendas',
    account: accountName, reference: orderNumber, created_at: new Date().toISOString(),
  }
  saveMovements([movement, ...existing])

  const idx = accounts.findIndex(a => a.name === accountName)
  if (idx !== -1) {
    accounts[idx].balance += amount
    saveAccounts(accounts)
    syncCfAccounts(accounts)
  }
  syncCfMovements([movement])

  try {
    postSettlementForSale(orderId, amount, cashAccountCode(accountName, accounts), movement.date)
  } catch { /* não bloqueia a liquidação por falha na contabilidade */ }
}

/**
 * Reconciliação: percorre todas as encomendas já canceladas e garante que
 * nenhuma deixou movimento de caixa ou lançamento contabilístico por anular —
 * cobre encomendas canceladas antes de cancelSaleMovement() existir.
 * Retorna o número de encomendas com algo para limpar.
 */
export function reconcileCancelledSales(): number {
  const orders: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_orders') || '[]') } catch { return [] } })()
  const cancelled = orders.filter(o => o.status === 'cancelado')
  const movements = readMovements()
  const journal: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_journal') || '[]') } catch { return [] } })()

  let count = 0
  for (const order of cancelled) {
    const hasMovement = movements.some(m => m.id === `sync-sale-${order.id}`)
    const hasJournal  = journal.some((e: any) => e.id === `auto-venda-${order.id}` || e.id === `auto-venda-sync-sale-${order.id}`)
    if (hasMovement || hasJournal) {
      cancelSaleMovement(order.id)
      count++
    }
  }
  return count
}

/**
 * Reconciliação: garante que todo o movimento de caixa MANUAL (Entrada/Saída/
 * Transferência registados directamente no Fluxo de Caixa) tem o seu lançamento
 * contabilístico — cobre movimentos criados antes desta ligação existir.
 * Não mexe em movimentos de Vendas/Fornecedores — esses já são tratados por
 * postAutoEntryForSale/postAutoEntryForPurchase (com IVA), não seria correcto
 * duplicá-los aqui sem esse cálculo.
 */
export function reconcileMovements(): number {
  const movements = readMovements()
  const accounts = readAccounts()
  const journal: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_journal') || '[]') } catch { return [] } })()

  let count = 0
  for (const m of movements) {
    if (m.category === 'Vendas' || m.category === 'Fornecedores') continue
    const journalId = `auto-mov-${m.id}`
    if (journal.some((e: any) => e.id === journalId)) continue
    postAutoEntryForMovement(
      m.id, m.date, m.description, m.type, m.amount,
      cashAccountCode(m.account, accounts),
      m.accountTo ? cashAccountCode(m.accountTo, accounts) : undefined,
    )
    count++
  }
  return count
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

  // Lançamento contabilístico (partidas dobradas) — idempotente, não bloqueia a compra
  // Usa o purchaseId (não o id do movimento) para bater certo com auto-compra-{purchaseId}.
  try {
    postAutoEntryForPurchase(purchaseId ?? id, movement.description, amount, getSettings().iva_rate, cashAccountCode(account, accounts), movement.date)
  } catch { /* não bloqueia a compra por falha na contabilidade */ }
}

/**
 * Compra a crédito (fiado) — regista o custo na Contabilidade (Crédito 33
 * Fornecedores) mas NÃO cria movimento de caixa: o dinheiro só sai quando
 * settlePayable() for chamado (ver Contas a Pagar/Receber no Admin).
 */
export function registerCreditPurchase(purchaseId: string, description: string, amount: number) {
  if (!amount || amount <= 0) return
  try {
    postCreditEntryForPurchase(purchaseId, description, amount, getSettings().iva_rate, format(new Date(), 'yyyy-MM-dd'))
  } catch { /* não bloqueia a compra por falha na contabilidade */ }
}

/**
 * Liquidação de uma compra a crédito — pagámos ao fornecedor. Só agora sai o
 * dinheiro da Caixa (mesmo id de movimento que uma compra normal, `sync-pur-{id}`
 * — passa a comportar-se como uma compra normal a partir daqui) e regista-se o
 * lançamento de liquidação (não volta a reconhecer custo).
 */
export function settlePayable(purchaseId: string, description: string, amount: number, accountName: string) {
  const accounts = readAccounts()
  const id = `sync-pur-${purchaseId}`
  const existing = readMovements()
  if (existing.some(m => m.id === id)) return // já liquidada

  const movement: CFMovement = {
    id, date: format(new Date(), 'yyyy-MM-dd'), type: 'expense',
    description: `Pagamento: ${description}`, amount, category: 'Fornecedores',
    account: accountName, created_at: new Date().toISOString(),
  }
  saveMovements([movement, ...existing])

  const idx = accounts.findIndex(a => a.name === accountName)
  if (idx !== -1) {
    accounts[idx].balance -= amount
    saveAccounts(accounts)
    syncCfAccounts(accounts)
  }
  syncCfMovements([movement])

  try {
    postSettlementForPurchase(purchaseId, amount, cashAccountCode(accountName, accounts), movement.date)
  } catch { /* não bloqueia a liquidação por falha na contabilidade */ }
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
    if (order.source === 'primavera') continue  // PRIMAVERA orders tracked in sales/VendasTab
    if (order.payment_status === 'pendente') continue  // venda a crédito — só entra em Caixa quando settleReceivable() liquidar
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
    try {
      postAutoEntryForSale(order.id, order.order_number, amount, getSettings().iva_rate, cashAccountCode(accountName, accounts), dateStr)
    } catch { /* não bloqueia o sync por falha na contabilidade */ }
  }

  // ── Compras / entradas de stock ─────────────────────────────────
  const products: any[]  = (() => { try { return JSON.parse(localStorage.getItem('khrismir_products') || '[]') } catch { return [] } })()
  const purchases: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_purchases') || '[]') } catch { return [] } })()
  for (const pur of purchases) {
    // Compras PRIMAVERA já têm o seu próprio cf_movement criado pelo script de sync — saltar para evitar duplicados
    if (pur.source === 'primavera') continue
    if (pur.payment_status === 'pendente') continue  // compra a crédito — só sai da Caixa quando settlePayable() liquidar
    const id = `sync-pur-${pur.id}`
    if (existingIds.has(id) || existingIds.has(`migpur-${pur.id}`)) continue
    const amount = Number(pur.total_price)
    if (!amount || amount <= 0) continue

    const productName = products.find((p: any) => p.id === pur.product_id)?.name || 'Produto'
    const dateStr = pur.created_at ? format(new Date(pur.created_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')

    const purDescription = `Compra: ${productName}${pur.supplier ? ` — ${pur.supplier}` : ''}`
    toAdd.push({
      id,
      date: dateStr,
      type: 'expense',
      description: purDescription,
      amount,
      category: 'Fornecedores',
      account: defaultAcc,
      created_at: pur.created_at || new Date().toISOString(),
    })
    try {
      postAutoEntryForPurchase(pur.id, purDescription, amount, getSettings().iva_rate, cashAccountCode(defaultAcc, accounts), dateStr)
    } catch { /* não bloqueia o sync por falha na contabilidade */ }
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

const EMPTY_SUMMARY = { totalBalance: 0, todayIncome: 0, todayExpense: 0, monthIncome: 0, monthExpense: 0, recentSales: [] as CFMovement[], recentExpenses: [] as CFMovement[], accounts: [] as CFAccount[] }

/** Retorna um resumo rápido para mostrar no Admin */
export function getCashFlowSummary() {
  try {
    const movements = readMovements()
    const accounts  = readAccounts()
    const today     = format(new Date(), 'yyyy-MM-dd')
    const thisMonth = format(new Date(), 'yyyy-MM')

    const safe = movements.filter(m => m && typeof m.date === 'string')

    const totalBalance   = accounts.reduce((s, a) => s + (a.balance ?? 0), 0)
    const todayIncome    = safe.filter(m => m.date === today && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const todayExpense   = safe.filter(m => m.date === today && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    const monthIncome    = safe.filter(m => m.date.startsWith(thisMonth) && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const monthExpense   = safe.filter(m => m.date.startsWith(thisMonth) && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    const recentSales    = safe.filter(m => m.category === 'Vendas').slice(0, 5)
    const recentExpenses = safe.filter(m => m.type === 'expense').slice(0, 5)

    return { totalBalance, todayIncome, todayExpense, monthIncome, monthExpense, recentSales, recentExpenses, accounts }
  } catch {
    return EMPTY_SUMMARY
  }
}
