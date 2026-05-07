/**
 * realtime.ts — Sincronização em tempo real via Supabase Realtime
 *
 * Princípio:
 *  - Qualquer dispositivo que escreve → grava no Supabase (INSERT/UPDATE/DELETE)
 *  - Supabase Realtime notifica TODOS os outros dispositivos via WebSocket
 *  - Este módulo recebe a notificação, actualiza o localStorage e dispara
 *    o evento global 'khrismir:sync' para que os componentes React recarreguem
 *
 * Resultado: mudança num dispositivo aparece em TODOS em < 1 segundo.
 */

import { supabase, isSupabaseReady } from './supabase'

// Mapa: tabela Supabase → chave localStorage
const TABLE_MAP: Record<string, string> = {
  products:             'khrismir_products',
  categories:           'khrismir_categories',
  orders:               'khrismir_orders',
  purchases:            'khrismir_purchases',
  cash_flow:            'khrismir_cashflow',
  delivery_zones:       'khrismir_delivery_zones',
  promo_codes:          'khrismir_promos',
  store_settings:       'khrismir_settings',
  suppliers:            'khrismir_suppliers',
  returns:              'khrismir_returns',
  loyalty_transactions: 'khrismir_loyalty',
  shift_sessions:       'khrismir_shifts',
  // Fluxo de caixa (novo sistema)
  cf_movements:         'cf_movements',
  cf_accounts:          'cf_accounts',
  cf_categories:        'cf_categories',
  // Lojas & perfis
  stores:               'khrismir_stores',
  profiles:             'khrismir_profiles',
}

// ── Evento global ──────────────────────────────────────────────────────────
/**
 * Dispara evento global para que os componentes React recarreguem.
 * @param table  Nome da tabela alterada (ex: 'products')
 */
export function notifyDataChange(table: string) {
  window.dispatchEvent(new CustomEvent('khrismir:sync', { detail: { table } }))
}

// ── Actualização local eficiente ──────────────────────────────────────────
function lsGet(key: string): any[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function lsSet(key: string, data: any) {
  localStorage.setItem(key, JSON.stringify(data))
}

/**
 * Aplica a mudança recebida do Realtime directamente no array do localStorage
 * sem precisar de ir buscar ao Supabase (excepto para orders que têm joins).
 */
async function applyChange(table: string, event: string, newRow: any, oldRow: any) {
  const lsKey = TABLE_MAP[table]
  if (!lsKey || !supabase) return

  // orders têm order_items (JOIN) — vai buscar os dados completos
  if (table === 'orders') {
    if (event === 'DELETE') {
      const id = oldRow?.id
      if (id) {
        const arr = lsGet(lsKey).filter((o: any) => o.id !== id)
        lsSet(lsKey, arr)
      }
    } else {
      // INSERT ou UPDATE: vai buscar o order com items
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', newRow.id)
        .maybeSingle()
      if (data) {
        const { order_items, ...order } = data as any
        const entry = { ...order, items: order_items ?? [] }
        const arr = lsGet(lsKey)
        const idx = arr.findIndex((o: any) => o.id === entry.id)
        if (idx >= 0) arr[idx] = entry
        else arr.unshift(entry)
        lsSet(lsKey, arr)
      }
    }
    return
  }

  // store_settings é um objecto único por loja (não array)
  if (table === 'store_settings') {
    if (newRow) lsSet(lsKey, newRow)
    return
  }

  // stores: quando uma loja muda, actualiza o StoreContext se for a loja activa
  if (table === 'stores') {
    const arr = lsGet(lsKey)
    if (event === 'DELETE') {
      const id = oldRow?.id
      if (id) lsSet(lsKey, arr.filter((s: any) => s.id !== id))
    } else if (newRow) {
      const idx = arr.findIndex((s: any) => s.id === newRow.id)
      if (idx >= 0) arr[idx] = { ...arr[idx], ...newRow }
      else arr.push(newRow)
      lsSet(lsKey, arr)
      // Se for a loja activa, actualiza o StoreContext
      try {
        const current = JSON.parse(localStorage.getItem('khrismir_current_store') || 'null')
        if (current && current.id === newRow.id) {
          localStorage.setItem('khrismir_current_store', JSON.stringify({ ...current, ...newRow }))
          window.dispatchEvent(new CustomEvent('khrismir:store-changed', { detail: { ...current, ...newRow } }))
        }
      } catch { /* non-fatal */ }
    }
    return
  }

  // Todas as outras tabelas: array simples
  if (event === 'DELETE') {
    const id = oldRow?.id
    if (id) {
      const arr = lsGet(lsKey).filter((item: any) => item.id !== id)
      lsSet(lsKey, arr)
    }
  } else {
    // INSERT ou UPDATE: upsert no array local
    // Normaliza campos com nome diferente entre Supabase e localStorage
    let row = { ...newRow }
    if (table === 'cf_movements' && 'account_to' in row) {
      row.accountTo = row.account_to
      delete row.account_to
    }
    const arr = lsGet(lsKey)
    const idx = arr.findIndex((item: any) => item.id === row?.id)
    if (idx >= 0) arr[idx] = { ...arr[idx], ...row }
    else arr.unshift(row)
    lsSet(lsKey, arr)
  }
}

// ── Gestor do canal ────────────────────────────────────────────────────────
let _channel: ReturnType<typeof supabase.channel> | null = null
let _started = false

/**
 * Inicia a subscrição Realtime para TODAS as tabelas num único canal.
 * Chama uma vez ao arrancar a app (main.tsx).
 */
export function startRealtime(): void {
  if (_started || !isSupabaseReady() || !supabase) return
  _started = true

  let ch = supabase.channel('khrismir-realtime-v2', {
    config: { broadcast: { ack: false } },
  })

  // Subscreve a todas as tabelas
  for (const table of Object.keys(TABLE_MAP)) {
    ch = ch.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table },
      async (payload: any) => {
        await applyChange(table, payload.eventType, payload.new, payload.old)
        notifyDataChange(table)
        console.log(`[Realtime] ${table} ${payload.eventType} → localStorage actualizado`)
      }
    )
  }

  _channel = ch.subscribe((status: string) => {
    console.log('[Realtime] Estado do canal:', status)
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('[Realtime] Canal perdido — a reconectar em 3s...')
      setTimeout(() => {
        _started = false
        _channel = null
        startRealtime()
      }, 3000)
    }
  })
}

/** Para a subscrição (uso opcional, ex: logout) */
export function stopRealtime(): void {
  if (_channel && supabase) {
    supabase.removeChannel(_channel)
    _channel = null
    _started = false
  }
}
