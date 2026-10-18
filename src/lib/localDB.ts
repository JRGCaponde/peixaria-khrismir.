/**
 * localDB.ts — Fila de envio durável (Electron e browser).
 *
 * A app continua a ler/escrever localStorage exactamente como sempre (ver
 * cashflow.ts, CashFlow.tsx) — isto não substitui isso. O que faz é registar
 * cada escrita TAMBÉM numa fila que sobrevive a fechar a app e a ficar sem
 * internet ou sem sessão — drainOutbox() (sync.ts) lê essa fila e só a marca
 * como enviada depois de confirmar no Supabase. Substitui o "faz-e-esquece"
 * que já causou perda de dados nesta app (uma chamada directa ao Supabase que
 * falha silenciosamente, sem nada a retomar o envio mais tarde).
 *
 *   * Electron: fila em SQLite (sync_outbox, ver electron/db.cjs).
 *   * Browser: a mesma fila em localStorage (chave khrismir_outbox). Antes o
 *     browser não tinha fila — com a sessão expirada, o que o Admin/POS
 *     gravava perdia-se. Só enfileira quando quem está a usar é da EQUIPA:
 *     um cliente no catálogo não pode escrever estas tabelas (RLS), e a fila
 *     dele nunca seria enviada.
 */

import { getCurrentStoreId } from './storeContext'

export function isElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron
}

export type OutboxEntry = {
  id: number; table_name: string; row_id: string; op: 'upsert' | 'delete'
  payload: any; store_id: string | null; created_at?: string
}

export interface OutboxApi {
  upsertLocal(table: string, rows: any[], storeId: string): Promise<void>
  deleteLocal(table: string, id: string, storeId: string): Promise<void>
  adoptOrphans(storeId: string): Promise<number>
  getPendingOutbox(): Promise<OutboxEntry[]>
  markSynced(ids: number[]): Promise<void>
}

// ── Papel de quem está a usar a app (alimentado por main.tsx) ──
const PAPEIS_EQUIPA = new Set(['admin', 'employee', 'gerente', 'super_admin'])
let papelActual: string | null = null
export function setOutboxUserRole(role: string | null | undefined) { papelActual = role ?? null }
/** Quem está a usar a app é da equipa (mesmo em login local, sem sessão da nuvem)? */
export function isEquipaActual(): boolean { return PAPEIS_EQUIPA.has(papelActual ?? '') }

// ── Fila do browser (localStorage) ─────────────────────────────
const WEB_KEY = 'khrismir_outbox'

function webRead(): OutboxEntry[] {
  try { return JSON.parse(localStorage.getItem(WEB_KEY) || '[]') } catch { return [] }
}
function webWrite(entries: OutboxEntry[]) {
  // Se o localStorage encher, falha alto (consola) em vez de corromper a fila.
  localStorage.setItem(WEB_KEY, JSON.stringify(entries))
}
function webNextId(entries: OutboxEntry[]) {
  return entries.reduce((m, e) => Math.max(m, e.id), 0) + 1
}

const webOutbox: OutboxApi = {
  async upsertLocal(table, rows, storeId) {
    let entries = webRead()
    let id = webNextId(entries)
    const now = new Date().toISOString()
    for (const row of rows) {
      const rowId = String(row.id)
      // Igual ao SQLite: só o último pedido de cada linha conta.
      entries = entries.filter(e => !(e.table_name === table && e.row_id === rowId && e.store_id === storeId))
      entries.push({ id: id++, table_name: table, row_id: rowId, op: 'upsert', payload: row, store_id: storeId, created_at: now })
    }
    webWrite(entries)
  },
  async deleteLocal(table, rowId, storeId) {
    const entries = webRead().filter(e => !(e.table_name === table && e.row_id === String(rowId) && e.store_id === storeId))
    entries.push({ id: webNextId(entries), table_name: table, row_id: String(rowId), op: 'delete', payload: null, store_id: storeId, created_at: new Date().toISOString() })
    webWrite(entries)
  },
  async adoptOrphans(storeId) {
    let n = 0
    const entries = webRead().map(e => (e.store_id ? e : (n++, { ...e, store_id: storeId })))
    if (n) webWrite(entries)
    return n
  },
  async getPendingOutbox() {
    return webRead().sort((a, b) => a.id - b.id)
  },
  async markSynced(ids) {
    // No browser não se guarda histórico: o que foi confirmado sai da fila (poupa espaço).
    const done = new Set(ids)
    webWrite(webRead().filter(e => !done.has(e.id)))
  },
}

/** A fila deste dispositivo: SQLite no Electron, localStorage no browser. */
export function outbox(): OutboxApi {
  return isElectron() ? (window as any).electronAPI.db : webOutbox
}

// Cada entrada da fila fica ligada à loja que estava aberta quando foi feita —
// senão o trabalho de uma loja aparecia (e era enviado) na loja seguinte.
// Sem loja aberta não há a quem atribuir, por isso não se enfileira.
function podeEnfileirar(): boolean {
  return isElectron() || PAPEIS_EQUIPA.has(papelActual ?? '')
}

/** Regista linhas para envio ao Supabase assim que houver internet e sessão. Não bloqueia. */
export function enqueueUpsert(table: string, rows: any[]): void {
  const storeId = getCurrentStoreId()
  if (!podeEnfileirar() || !rows.length || !storeId) return
  outbox().upsertLocal(table, rows, storeId).catch((e: any) =>
    console.error('[localDB] enqueueUpsert', table, e?.message)
  )
}

/** Regista uma eliminação para envio ao Supabase assim que houver internet e sessão. Não bloqueia. */
export function enqueueDelete(table: string, id: string): void {
  const storeId = getCurrentStoreId()
  if (!podeEnfileirar() || !storeId) return
  outbox().deleteLocal(table, id, storeId).catch((e: any) =>
    console.error('[localDB] enqueueDelete', table, e?.message)
  )
}
