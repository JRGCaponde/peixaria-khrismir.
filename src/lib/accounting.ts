/**
 * accounting.ts — Contabilidade por partidas dobradas (PGC-AO)
 *
 * A estrutura de classes (0-8) segue o Plano Geral de Contabilidade de
 * Angola (Decreto n.º 82/01). As sub-contas semeadas por defeito são um
 * esqueleto amplamente documentado — devem ser confirmadas/ajustadas por
 * um contabilista certificado antes de reportar oficialmente à AGT.
 *
 * Gera lançamentos automaticamente a partir dos mesmos pontos onde o Fluxo
 * de Caixa (lib/cashflow.ts) já regista vendas e compras — não duplica a
 * captura de dados, só acrescenta a vista em partidas dobradas.
 */

import type { AccountingAccount, JournalEntry, JournalLine } from '../types/database'
import { syncAccountingAccounts, syncJournalEntries, deleteJournalEntry } from './sync'

const ACCOUNTS_KEY = 'khrismir_accounts'
const JOURNAL_KEY = 'khrismir_journal'

// ── Plano de Contas — seed PGC-AO ──────────────────────────────
export const DEFAULT_ACCOUNTS: Omit<AccountingAccount, 'id' | 'created_at'>[] = [
  { code: '0',  name: 'Contas de Ordem',                          class: 0, nature: 'devedora', editable: false },
  { code: '11', name: 'Caixa',                                    class: 1, nature: 'devedora', editable: false },
  { code: '12', name: 'Depósitos à Ordem',                        class: 1, nature: 'devedora', editable: false },
  { code: '21', name: 'Mercadorias',                               class: 2, nature: 'devedora', editable: false },
  { code: '32', name: 'Clientes',                                  class: 3, nature: 'devedora', editable: false },
  { code: '33', name: 'Fornecedores',                              class: 3, nature: 'credora',  editable: false },
  { code: '35', name: 'Estado — IVA Liquidado',                    class: 3, nature: 'credora',  editable: false },
  { code: '36', name: 'Estado — IVA Dedutível',                    class: 3, nature: 'devedora', editable: false },
  { code: '41', name: 'Imobilizações Corpóreas',                   class: 4, nature: 'devedora', editable: false },
  { code: '51', name: 'Capital',                                   class: 5, nature: 'credora',  editable: false },
  { code: '61', name: 'Custo das Mercadorias Vendidas (CMVMC)',    class: 6, nature: 'devedora', editable: false },
  { code: '62', name: 'Fornecimentos e Serviços de Terceiros',     class: 6, nature: 'devedora', editable: false },
  { code: '71', name: 'Vendas de Mercadorias',                     class: 7, nature: 'credora',  editable: false },
  { code: '78', name: 'Outros Proveitos e Ganhos',                 class: 7, nature: 'credora',  editable: false },
  { code: '88', name: 'Resultado Líquido do Exercício',            class: 8, nature: 'credora',  editable: false },
]

function ls<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function save(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function getAccounts(): AccountingAccount[] {
  const stored = ls<AccountingAccount[] | null>(ACCOUNTS_KEY, null)
  if (stored && stored.length > 0) return stored
  const seeded = DEFAULT_ACCOUNTS.map(a => ({ ...a, id: `seed-${a.code}`, created_at: new Date().toISOString() }))
  save(ACCOUNTS_KEY, seeded)
  return seeded
}

export function saveAccounts(accounts: AccountingAccount[]) {
  save(ACCOUNTS_KEY, accounts)
  syncAccountingAccounts(accounts)
}

export function getJournalEntries(): JournalEntry[] {
  return ls<JournalEntry[]>(JOURNAL_KEY, [])
}

function saveJournal(entries: JournalEntry[]) {
  save(JOURNAL_KEY, entries)
}

const round2 = (n: number) => Math.round(n * 100) / 100

function linesBalanced(lines: JournalLine[]): boolean {
  const debit = round2(lines.reduce((s, l) => s + (l.debit || 0), 0))
  const credit = round2(lines.reduce((s, l) => s + (l.credit || 0), 0))
  return debit === credit && debit > 0
}

/** Lança um movimento manual. Rejeita se débitos e créditos não baterem. */
export function postManualEntry(
  date: string,
  description: string,
  lines: JournalLine[],
  createdBy?: string,
): { ok: boolean; error?: string } {
  if (lines.length < 2) return { ok: false, error: 'Um lançamento precisa de pelo menos 2 linhas' }
  if (!linesBalanced(lines)) return { ok: false, error: 'Débitos e créditos têm de ser iguais e maiores que zero' }

  const entry: JournalEntry = {
    id: crypto.randomUUID(),
    date, description, lines,
    source: 'manual',
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }
  const updated = [entry, ...getJournalEntries()]
  saveJournal(updated)
  syncJournalEntries([entry])
  return { ok: true }
}

function postAutoEntry(id: string, date: string, description: string, reference: string, source: 'auto_venda' | 'auto_compra' | 'auto_movimento', lines: JournalLine[]) {
  const existing = getJournalEntries()
  if (existing.some(e => e.id === id)) return // idempotente
  if (!linesBalanced(lines)) return // segurança — nunca grava desequilibrado

  const entry: JournalEntry = { id, date, description, reference, source, lines, created_at: new Date().toISOString() }
  const updated = [entry, ...existing]
  saveJournal(updated)
  syncJournalEntries([entry])
}

/** Remove um lançamento (ex: quando a venda/compra de origem é cancelada) */
export function removeJournalEntry(id: string) {
  const remaining = getJournalEntries().filter(e => e.id !== id)
  saveJournal(remaining)
  deleteJournalEntry(id)
}

/**
 * Gera o lançamento de uma venda (chamado a partir do mesmo ponto onde
 * lib/cashflow.ts regista o movimento de caixa da venda).
 * Débito: conta de caixa/banco pelo valor bruto.
 * Crédito: Vendas (líquido) + Estado IVA Liquidado (imposto).
 */
export function postAutoEntryForSale(
  orderId: string, orderNumber: string, gross: number, ivaRate: number, cashAccountCode: string, date: string,
) {
  const ivaPct = ivaRate / 100
  const net = round2(gross / (1 + ivaPct))
  const iva = round2(gross - net)
  postAutoEntry(
    `auto-venda-${orderId}`, date, `Venda #${orderNumber}`, orderNumber, 'auto_venda',
    [
      { account_code: cashAccountCode, debit: gross, credit: 0 },
      { account_code: '71', debit: 0, credit: net },
      { account_code: '35', debit: 0, credit: iva },
    ].filter(l => l.debit > 0 || l.credit > 0),
  )
}

/**
 * Gera o lançamento de uma compra.
 * Débito: CMVMC (líquido) + Estado IVA Dedutível (imposto).
 * Crédito: conta de caixa/banco pelo valor bruto.
 */
export function postAutoEntryForPurchase(
  purchaseId: string, description: string, gross: number, ivaRate: number, cashAccountCode: string, date: string,
) {
  const ivaPct = ivaRate / 100
  const net = round2(gross / (1 + ivaPct))
  const iva = round2(gross - net)
  postAutoEntry(
    `auto-compra-${purchaseId}`, date, description, purchaseId, 'auto_compra',
    [
      { account_code: '61', debit: net, credit: 0 },
      { account_code: '36', debit: iva, credit: 0 },
      { account_code: cashAccountCode, debit: 0, credit: gross },
    ].filter(l => l.debit > 0 || l.credit > 0),
  )
}

/**
 * Venda a crédito (fiado) — mesmo lançamento de receita de postAutoEntryForSale
 * (mesmo id, por isso nunca duplica se depois também se chamar a versão normal),
 * só que a contrapartida é 32 Clientes (a receber) em vez da conta de caixa/banco.
 */
export function postCreditEntryForSale(orderId: string, orderNumber: string, gross: number, ivaRate: number, date: string) {
  const ivaPct = ivaRate / 100
  const net = round2(gross / (1 + ivaPct))
  const iva = round2(gross - net)
  postAutoEntry(
    `auto-venda-${orderId}`, date, `Venda #${orderNumber} (fiado)`, orderNumber, 'auto_venda',
    [
      { account_code: '32', debit: gross, credit: 0 },
      { account_code: '71', debit: 0, credit: net },
      { account_code: '35', debit: 0, credit: iva },
    ].filter(l => l.debit > 0 || l.credit > 0),
  )
}

/**
 * Compra a crédito — mesmo lançamento de custo de postAutoEntryForPurchase,
 * mas a contrapartida é 33 Fornecedores (a pagar) em vez de caixa/banco.
 */
export function postCreditEntryForPurchase(purchaseId: string, description: string, gross: number, ivaRate: number, date: string) {
  const ivaPct = ivaRate / 100
  const net = round2(gross / (1 + ivaPct))
  const iva = round2(gross - net)
  postAutoEntry(
    `auto-compra-${purchaseId}`, date, `${description} (fiado)`, purchaseId, 'auto_compra',
    [
      { account_code: '61', debit: net, credit: 0 },
      { account_code: '36', debit: iva, credit: 0 },
      { account_code: '33', debit: 0, credit: gross },
    ].filter(l => l.debit > 0 || l.credit > 0),
  )
}

/**
 * Liquidação de uma venda a crédito (o cliente pagou). Não volta a reconhecer
 * receita — só troca "a receber" (32 Clientes) por dinheiro em caixa/banco.
 */
export function postSettlementForSale(orderId: string, amount: number, cashAccountCode: string, date: string) {
  postAutoEntry(
    `auto-liq-venda-${orderId}`, date, `Recebimento — venda a crédito`, orderId, 'auto_movimento',
    [
      { account_code: cashAccountCode, debit: amount, credit: 0 },
      { account_code: '32', debit: 0, credit: amount },
    ],
  )
}

/**
 * Liquidação de uma compra a crédito (pagámos ao fornecedor). Não volta a
 * reconhecer custo — só troca "a pagar" (33 Fornecedores) por saída de caixa/banco.
 */
export function postSettlementForPurchase(purchaseId: string, amount: number, cashAccountCode: string, date: string) {
  postAutoEntry(
    `auto-liq-compra-${purchaseId}`, date, `Pagamento — compra a crédito`, purchaseId, 'auto_movimento',
    [
      { account_code: '33', debit: amount, credit: 0 },
      { account_code: cashAccountCode, debit: 0, credit: amount },
    ],
  )
}

/**
 * Gera o lançamento de um movimento manual de caixa (Entrada/Saída/Transferência
 * registado directamente no Fluxo de Caixa, fora do fluxo de vendas/compras).
 * Sem IVA — não é uma transacção comercial tributável, é um movimento de tesouraria.
 * Entrada:  Débito conta de caixa/banco   / Crédito 78 Outros Proveitos e Ganhos
 * Saída:    Débito 62 Fornec. e Serv. Terceiros / Crédito conta de caixa/banco
 * Transf.:  Débito conta destino          / Crédito conta origem
 */
export function postAutoEntryForMovement(
  movementId: string, date: string, description: string,
  type: 'income' | 'expense' | 'transfer',
  amount: number, accountCode: string, accountToCode: string | undefined,
) {
  const lines: JournalLine[] =
    type === 'income'
      ? [{ account_code: accountCode, debit: amount, credit: 0 }, { account_code: '78', debit: 0, credit: amount }]
      : type === 'expense'
      ? [{ account_code: '62', debit: amount, credit: 0 }, { account_code: accountCode, debit: 0, credit: amount }]
      : [{ account_code: accountToCode ?? accountCode, debit: amount, credit: 0 }, { account_code: accountCode, debit: 0, credit: amount }]

  postAutoEntry(`auto-mov-${movementId}`, date, description, movementId, 'auto_movimento', lines)
}

// ── Relatórios ───────────────────────────────────────────────────────────

export interface TrialBalanceRow {
  account: AccountingAccount
  debit: number
  credit: number
  balance: number // positivo = saldo devedor, negativo = saldo credor
}

export function getTrialBalance(upToDate?: string): TrialBalanceRow[] {
  const accounts = getAccounts()
  const entries = getJournalEntries().filter(e => !upToDate || e.date <= upToDate)
  const totals = new Map<string, { debit: number; credit: number }>()

  for (const entry of entries) {
    for (const line of entry.lines) {
      const t = totals.get(line.account_code) ?? { debit: 0, credit: 0 }
      t.debit += line.debit || 0
      t.credit += line.credit || 0
      totals.set(line.account_code, t)
    }
  }

  return accounts
    .map(account => {
      const t = totals.get(account.code) ?? { debit: 0, credit: 0 }
      return { account, debit: round2(t.debit), credit: round2(t.credit), balance: round2(t.debit - t.credit) }
    })
    .filter(row => row.debit > 0 || row.credit > 0)
}

export interface IncomeStatement {
  proveitos: number
  custos: number
  resultadoLiquido: number
  linhas: { account: AccountingAccount; total: number }[]
}

export function getIncomeStatement(startDate?: string, endDate?: string): IncomeStatement {
  const accounts = getAccounts()
  const entries = getJournalEntries().filter(e =>
    (!startDate || e.date >= startDate) && (!endDate || e.date <= endDate),
  )
  const totals = new Map<string, number>()
  for (const entry of entries) {
    for (const line of entry.lines) {
      const account = accounts.find(a => a.code === line.account_code)
      if (!account) continue
      const delta = account.class === 7 ? (line.credit - line.debit) : account.class === 6 ? (line.debit - line.credit) : 0
      if (delta === 0) continue
      totals.set(account.code, (totals.get(account.code) ?? 0) + delta)
    }
  }
  const linhas = accounts
    .filter(a => a.class === 6 || a.class === 7)
    .map(account => ({ account, total: round2(totals.get(account.code) ?? 0) }))
    .filter(l => l.total !== 0)

  const proveitos = round2(linhas.filter(l => l.account.class === 7).reduce((s, l) => s + l.total, 0))
  const custos     = round2(linhas.filter(l => l.account.class === 6).reduce((s, l) => s + l.total, 0))
  return { proveitos, custos, resultadoLiquido: round2(proveitos - custos), linhas }
}

export interface BalanceSheet {
  activo: { account: AccountingAccount; total: number }[]
  passivo: { account: AccountingAccount; total: number }[]
  capitalProprio: { account: AccountingAccount; total: number }[]
  resultadoPeriodo: number
  totalActivo: number
  totalPassivoMaisCapital: number
}

/** Balanço a uma data — parte de saldos a 0 (sistema novo); lançamento de abertura é manual, como é prática normal. */
export function getBalanceSheet(upToDate?: string): BalanceSheet {
  const trial = getTrialBalance(upToDate)
  const activo = trial.filter(r => r.account.class >= 1 && r.account.class <= 4 && r.balance !== 0)
    .map(r => ({ account: r.account, total: r.balance }))
  const passivo = trial.filter(r => r.account.class === 3 && r.account.nature === 'credora' && r.balance !== 0)
    .map(r => ({ account: r.account, total: -r.balance }))
  const capitalProprio = trial.filter(r => r.account.class === 5 && r.balance !== 0)
    .map(r => ({ account: r.account, total: -r.balance }))

  const resultadoPeriodo = getIncomeStatement(undefined, upToDate).resultadoLiquido
  const totalActivo = round2(activo.reduce((s, l) => s + l.total, 0))
  const totalPassivoMaisCapital = round2(
    passivo.reduce((s, l) => s + l.total, 0) + capitalProprio.reduce((s, l) => s + l.total, 0) + resultadoPeriodo,
  )

  return { activo, passivo, capitalProprio, resultadoPeriodo, totalActivo, totalPassivoMaisCapital }
}
