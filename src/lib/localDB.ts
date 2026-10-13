/**
 * localDB.ts — Fila de envio durável para o Electron.
 *
 * A app continua a ler/escrever localStorage exactamente como sempre (ver
 * cashflow.ts, CashFlow.tsx) — isto não substitui isso. O que faz é, no
 * Electron, registar cada escrita TAMBÉM numa fila em SQLite (sync_outbox,
 * ver electron/db.cjs) que sobrevive a fechar a app e a ficar sem internet —
 * drainOutbox() (sync.ts) lê essa fila e só a marca como enviada depois de
 * confirmar no Supabase. Substitui o "faz-e-esquece" que já causou perda de
 * dados nesta app (uma chamada directa ao Supabase que falha silenciosamente
 * quando offline, sem nada a retomar o envio mais tarde).
 *
 * Na Web não há fila nenhuma — estas chamadas não fazem nada lá, porque a
 * app já fala directamente com o Supabase.
 */

import { getCurrentStoreId } from './storeContext'

export function isElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron
}

// Cada entrada da fila fica ligada à loja que estava aberta quando foi feita —
// senão o trabalho de uma loja aparecia (e era enviado) na loja seguinte.
// Sem loja aberta não há a quem atribuir, por isso não se enfileira.

/** Regista linhas para envio ao Supabase assim que houver internet. Não bloqueia. */
export function enqueueUpsert(table: string, rows: any[]): void {
  const storeId = getCurrentStoreId()
  if (!isElectron() || !rows.length || !storeId) return
  ;(window as any).electronAPI.db.upsertLocal(table, rows, storeId).catch((e: any) =>
    console.error('[localDB] enqueueUpsert', table, e?.message)
  )
}

/** Regista uma eliminação para envio ao Supabase assim que houver internet. Não bloqueia. */
export function enqueueDelete(table: string, id: string): void {
  const storeId = getCurrentStoreId()
  if (!isElectron() || !storeId) return
  ;(window as any).electronAPI.db.deleteLocal(table, id, storeId).catch((e: any) =>
    console.error('[localDB] enqueueDelete', table, e?.message)
  )
}
