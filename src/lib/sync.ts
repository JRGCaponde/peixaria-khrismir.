/**
 * Camada de sincronização Supabase ↔ localStorage
 * pullAll(): Supabase → localStorage
 * pushAll(): localStorage → Supabase
 */

import { supabase, isSupabaseReady } from './supabase'
import { getCurrentStoreId } from './storeContext'
import type { Order, Product, Category, CashFlow, Purchase, DeliveryZone, PromoCode } from '../types/database'
import type { StoreSettings } from './settings'

function ls<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function lsSet(key: string, v: any) { localStorage.setItem(key, JSON.stringify(v)) }


// Chaves de negócio isoladas por loja — limpas quando a loja muda
const STORE_BUSINESS_KEYS = [
  'khrismir_products', 'khrismir_categories', 'khrismir_orders',
  'khrismir_cashflow', 'khrismir_purchases', 'khrismir_suppliers',
  'khrismir_delivery_zones', 'khrismir_promos', 'khrismir_returns',
  'khrismir_loyalty', 'khrismir_shifts', 'khrismir_settings',
  'cf_movements', 'cf_accounts', 'cf_categories', 'cf_deleted_ids',
  'khrismir_auto_synced',
]
const LAST_PULL_STORE_KEY = 'khrismir_last_pull_store'

// ── PULL: Supabase → localStorage ─────────────────────────────
export async function pullAll(): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado' }

  try {
    const sid = getCurrentStoreId()

    // ── Detecção de mudança de loja ──────────────────────────────────────────
    // pullAll() é sempre chamado após login — é o ponto garantido para detectar
    // quando a loja mudou e limpar os dados da loja anterior do localStorage.
    if (sid) {
      const lastSid = localStorage.getItem(LAST_PULL_STORE_KEY)
      if (lastSid && lastSid !== sid) {
        // Loja diferente — limpa todos os dados de negócio do dispositivo
        STORE_BUSINESS_KEYS.forEach(k => localStorage.removeItem(k))
      }
      localStorage.setItem(LAST_PULL_STORE_KEY, sid)
    }
    // ────────────────────────────────────────────────────────────────────────

    const sf = (q: any) => sid ? q.eq('store_id', sid) : q

    const [cat, prod, ord, cf, pur, zones, promos, sets, sup, ret, loy, shifts, profiles] = await Promise.all([
      sf(supabase.from('categories').select('*').order('name')),
      sf(supabase.from('products').select('*').order('name')),
      sf(supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })),
      sf(supabase.from('cash_flow').select('*').order('created_at', { ascending: false })),
      sf(supabase.from('purchases').select('*').order('created_at', { ascending: false })),
      sf(supabase.from('delivery_zones').select('*').order('name')),
      sf(supabase.from('promo_codes').select('*').order('created_at', { ascending: false })),
      sid
        ? supabase.from('store_settings').select('*').eq('store_id', sid).maybeSingle()
        : supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
      sf(supabase.from('suppliers').select('*').order('name')),
      sf(supabase.from('returns').select('*').order('created_at', { ascending: false })),
      sf(supabase.from('loyalty_transactions').select('*').order('created_at', { ascending: false })),
      sf(supabase.from('shift_sessions').select('*').order('opened_at', { ascending: false })),
      sid
        ? supabase.from('profiles').select('*').eq('role', 'client').eq('store_id', sid).order('created_at', { ascending: false })
        : supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false }),
    ])

    // Fluxo de caixa (novo sistema) — pull paralelo
    const [cfAccounts, cfCategories, cfMovements, storesData] = await Promise.all([
      sf(supabase.from('cf_accounts').select('*').order('name')),
      sf(supabase.from('cf_categories').select('*').order('name')),
      sf(supabase.from('cf_movements').select('*').order('created_at', { ascending: false })),
      supabase.from('stores').select('*').eq('active', true).order('name'),
    ])

    // SEMPRE escreve no localStorage — mesmo arrays vazios limpam dados da loja anterior.
    // Nunca usar "length > 0" aqui: uma loja nova com 0 movimentos deve limpar os
    // movimentos que ficaram de outra loja neste dispositivo.
    if (cfAccounts.data)   lsSet('cf_accounts',   cfAccounts.data)
    if (cfCategories.data) lsSet('cf_categories', cfCategories.data)
    if (cfMovements.data)  lsSet('cf_movements',  cfMovements.data.map((m: any) => ({ ...m, accountTo: m.account_to })))
    if (storesData.data)   lsSet('khrismir_stores', storesData.data)

    if (cat.data)    lsSet('khrismir_categories', cat.data)
    if (prod.data)   lsSet('khrismir_products', prod.data)
    if (ord.data) {
      const fromSupabase = ord.data.map(({ order_items, ...o }: any) => ({ ...o, items: order_items ?? [] }))
      // Preservar pedidos locais que ainda não chegaram ao Supabase (apenas da mesma loja)
      const existing: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_orders') || '[]') } catch { return [] } })()
      const supabaseIds     = new Set(fromSupabase.map((o: any) => o.id))
      const supabaseNumbers = new Set(fromSupabase.map((o: any) => o.order_number))
      const localOnly = existing.filter((o: any) =>
        !supabaseIds.has(o.id) && !supabaseNumbers.has(o.order_number) &&
        // Só preserva pedidos locais da mesma loja (ou sem store_id se não há filtro)
        (!sid || !o.store_id || o.store_id === sid)
      )
      const seenNums = new Set<string>()
      const cleanLocal = localOnly.filter((o: any) => {
        if (!o.order_number || seenNums.has(o.order_number)) return false
        seenNums.add(o.order_number)
        return true
      })
      lsSet('khrismir_orders', [...cleanLocal, ...fromSupabase])
    }
    if (cf.data)     lsSet('khrismir_cashflow', cf.data)

    // Purchases — merge local + Supabase (preserva locais que ainda não chegaram à cloud)
    if (pur.data) {
      const localPur: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_purchases') || '[]') } catch { return [] } })()
      const sbPurIds = new Set(pur.data.map((p: any) => p.id))
      const localOnlyPur = localPur.filter((p: any) => p.id && !sbPurIds.has(p.id))
      lsSet('khrismir_purchases', [...localOnlyPur, ...pur.data])
    }

    if (zones.data)  lsSet('khrismir_delivery_zones', zones.data)
    if (promos.data) lsSet('khrismir_promos', promos.data)
    if (sets.data)   lsSet('khrismir_settings', sets.data)
    if (sup.data)    lsSet('khrismir_suppliers', sup.data)
    if (ret.data)    lsSet('khrismir_returns', ret.data)
    if (loy.data)    lsSet('khrismir_loyalty', loy.data)

    // Shifts — merge local + Supabase (preserva turnos locais que ainda não chegaram à cloud)
    if (shifts.data) {
      const localShifts: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_shifts') || '[]') } catch { return [] } })()
      const sbShiftIds = new Set(shifts.data.map((s: any) => s.id))
      const localOnlyShifts = localShifts.filter((s: any) => s.id && !sbShiftIds.has(s.id))
      lsSet('khrismir_shifts', [...localOnlyShifts, ...shifts.data])
    }
    if (profiles.data && profiles.data.length > 0) {
      // Merge com clientes locais (sem sobrescrever contas de funcionários)
      const local: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_clients') || '[]') } catch { return [] } })()
      const supabaseIds = new Set(profiles.data.map((p: any) => p.id))
      const localOnly = local.filter((c: any) => !supabaseIds.has(c.id))
      lsSet('khrismir_clients', [...localOnly, ...profiles.data])
    }

    // Notifica todos os componentes que os dados foram actualizados
    window.dispatchEvent(new CustomEvent('khrismir:sync', { detail: { table: 'pullAll' } }))

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── PUSH: localStorage → Supabase ─────────────────────────────
export async function pushAll(): Promise<{ ok: boolean; error?: string; details: string[] }> {
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado', details: [] }

  const details: string[] = []
  let ok = true

  const upsert = async (table: string, rows: any[], logName: string) => {
    if (!rows.length) { details.push(`${logName}: sem dados`); return }
    const { error } = await supabase!.from(table).upsert(rows, { onConflict: 'id' })
    if (error) { details.push(`❌ ${logName}: ${error.message}`); ok = false }
    else details.push(`✅ ${logName}: ${rows.length} registos`)
  }

  const categories:  Category[]             = ls('khrismir_categories', [])
  const products:    Product[]              = ls('khrismir_products', [])
  const orders:      Order[]               = ls('khrismir_orders', [])
  const cashFlow:    CashFlow[]            = ls('khrismir_cashflow', [])
  const purchases:   Purchase[]            = ls('khrismir_purchases', [])
  const zones:       DeliveryZone[]        = ls('khrismir_delivery_zones', [])
  const promos:      PromoCode[]           = ls('khrismir_promos', [])
  const settings:    Partial<StoreSettings> = ls('khrismir_settings', {})
  const suppliers:   any[]                 = ls('khrismir_suppliers', [])
  const returns_:    any[]                 = ls('khrismir_returns', [])
  const loyalty:     any[]                 = ls('khrismir_loyalty', [])
  const shifts:      any[]                 = ls('khrismir_shifts', [])

  const sid = getCurrentStoreId()

  await upsert('categories', categories.map(c => ({
    id: c.id, name: c.name, description: c.description ?? '', image_url: c.image_url ?? '',
    store_id: sid,
  })), 'Categorias')

  // IMPORTANTE: stock_quantity é EXCLUÍDO do pushAll para não sobrescrever
  // o stock gerido atomicamente pelo RPC decrement_product_stock.
  // O stock só é actualizado por: RPC (venda POS/checkout) ou syncProducts (Admin edita produto).
  await upsert('products', products.map(p => ({
    id: p.id, name: p.name, price: p.price, cost_price: p.cost_price ?? 0,
    unit: p.unit, min_stock: p.min_stock,
    allow_whole: p.allow_whole, allow_clean: p.allow_clean,
    allow_fillet: p.allow_fillet, allow_steak: p.allow_steak,
    category_id: p.category_id, image_url: p.image_url ?? '',
    expiry_date: p.expiry_date ?? null, created_at: p.created_at,
    store_id: sid,
  })), 'Produtos')

  // Encomendas — estratégia à prova de falhas para evitar duplicate key em order_number
  if (orders.length) {
    // 1. Busca TODOS os registos do Supabase (id + order_number)
    //    Assim sabemos exactamente o que já existe antes de tentar inserir
    const { data: sbOrders } = await supabase!
      .from('orders')
      .select('id, order_number')
      .limit(5000)  // acima do normal para qualquer peixaria

    const sbIdSet  = new Set<string>((sbOrders ?? []).map((r: any) => r.id))
    const sbNumMap: Record<string, string> = {}   // order_number → id no Supabase
    for (const r of sbOrders ?? []) sbNumMap[r.order_number] = r.id

    // 2. Classificar cada ordem local:
    //    A) id JÁ existe no Supabase                                  → UPDATE seguro (onConflict id)
    //    B) id NÃO existe mas order_number JÁ existe com id diferente → SKIP (cópia local obsoleta)
    //    C) id NÃO existe E order_number NÃO existe                   → INSERT novo
    // Só enviamos A e C — nunca B (que causava o erro)
    const toSync: any[] = []
    const seenNum = new Set<string>()
    const seenId  = new Set<string>()

    for (const o of orders) {
      const oid = (o as any).id
      const onum = (o as any).order_number
      if (!oid) continue                                    // sem id → ignora
      if (seenId.has(oid) || seenNum.has(onum)) continue  // duplicado local → ignora

      if (sbIdSet.has(oid)) {
        // Caso A: UPDATE
        toSync.push(o)
        seenId.add(oid)
        if (onum) seenNum.add(onum)
      } else if (onum && sbNumMap[onum]) {
        // Caso B: order_number já existe no Supabase com outro id → SKIP
        // (não enviamos — evita o duplicate key)
        continue
      } else {
        // Caso C: INSERT genuinamente novo
        toSync.push(o)
        seenId.add(oid)
        if (onum) seenNum.add(onum)
      }
    }

    if (toSync.length === 0) {
      details.push('✅ Encomendas: já sincronizadas')
    } else {
      const orderRows = toSync.map((o: any) => ({
        id: o.id, order_number: o.order_number,
        customer_id: o.customer_id && UUID_REGEX.test(o.customer_id) ? o.customer_id : null,
        customer_name: o.customer_name ?? '', customer_phone: o.customer_phone ?? '',
        customer_nif: o.customer_nif ?? '', status: o.status ?? 'pendente',
        payment_type: o.payment_type ?? 'dinheiro', delivery_type: o.delivery_type ?? 'retirada',
        delivery_zone: o.delivery_zone ?? '', delivery_fee: o.delivery_fee ?? 0,
        delivery_address: o.delivery_address ?? '', discount_code: o.discount_code ?? '',
        discount_amount: o.discount_amount ?? 0, subtotal: o.subtotal ?? o.total ?? 0,
        total: o.total ?? 0, notes: o.notes ?? '',
        created_at: o.created_at, updated_at: o.updated_at,
        store_id: sid,
      }))

      const { error: oe } = await supabase!.from('orders').upsert(orderRows, { onConflict: 'id' })
      if (oe) { details.push(`❌ Encomendas: ${oe.message}`); ok = false }
      else {
        const allItems = toSync.flatMap((o: any) => (o.items || []).map((i: any) => ({
          id: i.id, order_id: o.id, product_id: i.product_id ?? '',
          product_name: i.product_name ?? '', quantity: i.quantity ?? 0,
          unit_price: i.unit_price ?? 0, preparation: i.preparation ?? '',
          total_price: i.total_price ?? 0, store_id: sid,
        })))
        if (allItems.length) {
          // Desduplicar itens por id
          const seenItem = new Set<string>()
          const dedupedItems = allItems.filter((i: any) => {
            if (!i.id || seenItem.has(i.id)) return false
            seenItem.add(i.id)
            return true
          })
          const { error: ie } = await supabase!.from('order_items').upsert(dedupedItems, { onConflict: 'id' })
          if (ie) { details.push(`❌ Itens encomendas: ${ie.message}`); ok = false }
          else details.push(`✅ Encomendas: ${toSync.length} (${dedupedItems.length} itens)`)
        } else {
          details.push(`✅ Encomendas: ${toSync.length}`)
        }
      }
    }
  } else {
    details.push('Encomendas: sem dados')
  }

  await upsert('cash_flow', cashFlow.map(c => ({
    id: c.id, type: c.type, amount: c.amount, description: c.description,
    order_number: (c as any).order_number ?? '', payment_type: (c as any).payment_type ?? '',
    created_at: c.created_at, store_id: sid,
  })), 'Fluxo de Caixa')

  await upsert('purchases', purchases.map(p => ({
    id: (p as any).id, product_id: (p as any).product_id ?? '',
    product_name: (p as any).product_name ?? '', quantity: (p as any).quantity ?? 0,
    unit_price: (p as any).unit_price ?? 0, total_price: (p as any).total_price ?? 0,
    supplier: (p as any).supplier ?? '', created_at: (p as any).created_at,
    store_id: sid,
  })), 'Compras')

  await upsert('delivery_zones', zones.map(z => ({
    id: z.id, name: z.name, price: z.price, description: z.description ?? '',
    store_id: sid,
  })), 'Zonas de Entrega')

  await upsert('promo_codes', promos.map(p => ({
    id: p.id, code: p.code, discount_type: p.discount_type, discount_value: p.discount_value,
    min_order: p.min_order ?? 0, uses: p.uses ?? 0, max_uses: p.max_uses ?? null,
    expires_at: p.expires_at ?? null, active: p.active ?? true, created_at: p.created_at,
    store_id: sid,
  })), 'Promoções')

  await upsert('suppliers', suppliers.map(s => ({
    id: s.id, name: s.name, nif: s.nif ?? '', phone: s.phone ?? '',
    email: s.email ?? '', address: s.address ?? '', notes: s.notes ?? '',
    created_at: s.created_at, store_id: sid,
  })), 'Fornecedores')

  await upsert('returns', returns_.map(r => ({
    id: r.id, order_id: r.order_id ?? '', order_number: r.order_number,
    customer_name: r.customer_name ?? '', items: r.items ?? [],
    total: r.total ?? 0, reason: r.reason ?? '', created_at: r.created_at,
    store_id: sid,
  })), 'Devoluções')

  await upsert('loyalty_transactions', loyalty.map(l => ({
    id: l.id, client_id: l.client_id ?? '', client_name: l.client_name ?? '',
    points: l.points ?? 0, type: l.type, order_id: l.order_id ?? '',
    created_at: l.created_at, store_id: sid,
  })), 'Fidelização')

  await upsert('shift_sessions', shifts.map(s => ({
    id: s.id, opened_at: s.opened_at, closed_at: s.closed_at ?? null,
    opening_balance: s.opening_balance ?? 0, closing_balance: s.closing_balance ?? null,
    cash_counted: s.cash_counted ?? null, difference: s.difference ?? null,
    opened_by: s.opened_by ?? '', closed_by: s.closed_by ?? null, notes: s.notes ?? '',
    store_id: sid,
  })), 'Turnos')

  if (Object.keys(settings).length) {
    const { error } = await supabase!.from('store_settings').upsert(
      { id: 1, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'id' }
    )
    if (error) { details.push(`❌ Configurações: ${error.message}`); ok = false }
    else details.push('✅ Configurações')
  }

  return { ok, details }
}

// ── ESCRITAS INCREMENTAIS ─────────────────────────────────────

export async function syncProducts(products: Product[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('products').upsert(products.map(p => ({
    id: p.id, name: p.name, price: p.price, cost_price: p.cost_price ?? 0,
    unit: p.unit, stock_quantity: p.stock_quantity, min_stock: p.min_stock,
    allow_whole: p.allow_whole, allow_clean: p.allow_clean,
    allow_fillet: p.allow_fillet, allow_steak: p.allow_steak,
    category_id: p.category_id, image_url: p.image_url ?? '',
    expiry_date: p.expiry_date ?? null, store_id: sid,
  })), { onConflict: 'id' }).then()
}

/**
 * Decrementa o stock de um produto atomicamente no Supabase via RPC.
 * Retorna o novo stock_quantity confirmado pelo servidor, ou null em caso de erro.
 * Actualiza também o localStorage com o valor autoritativo do servidor.
 */
export async function syncProductStock(productId: string, quantity: number): Promise<number | null> {
  if (!isSupabaseReady() || !supabase) return null
  try {
    const { data, error } = await supabase.rpc('decrement_product_stock', {
      p_product_id: productId,
      p_quantity: quantity,
      p_store_id: getCurrentStoreId(),
    })
    if (error || !data || !data.length) {
      console.warn('[syncProductStock] RPC error:', error?.message)
      return null
    }
    const newStock: number = data[0].stock_quantity
    // Actualiza localStorage com o valor autoritativo do servidor
    try {
      const prods: Product[] = JSON.parse(localStorage.getItem('khrismir_products') || '[]')
      const idx = prods.findIndex(p => p.id === productId)
      if (idx !== -1) {
        prods[idx].stock_quantity = newStock
        localStorage.setItem('khrismir_products', JSON.stringify(prods))
      }
    } catch { /* non-fatal */ }
    return newStock
  } catch (e: any) {
    console.warn('[syncProductStock] exception:', e?.message)
    return null
  }
}

export async function syncCategories(categories: Category[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('categories').upsert(categories.map(c => ({
    id: c.id, name: c.name, description: c.description ?? '', image_url: c.image_url ?? '',
    store_id: sid,
  })), { onConflict: 'id' }).then()
}

export async function syncOrder(order: Order): Promise<boolean> {
  if (!isSupabaseReady() || !supabase) return false
  const o = order as any
  // customer_id deve ser UUID válido (Supabase Auth) — caso contrário null
  const customerId = o.customer_id && UUID_REGEX.test(o.customer_id) ? o.customer_id : null
  const orderRow = {
    id: o.id, order_number: o.order_number,
    customer_id: customerId,
    customer_name: o.customer_name ?? '', customer_phone: o.customer_phone ?? '',
    customer_nif: o.customer_nif ?? '', status: o.status ?? 'pendente',
    payment_type: o.payment_type ?? 'dinheiro', delivery_type: o.delivery_type ?? 'retirada',
    delivery_zone: o.delivery_zone ?? '', delivery_fee: o.delivery_fee ?? 0,
    delivery_address: o.delivery_address ?? '', discount_code: o.discount_code ?? '',
    discount_amount: o.discount_amount ?? 0, subtotal: o.subtotal ?? o.total ?? 0,
    total: o.total ?? 0, notes: o.notes ?? '',
    created_at: o.created_at, updated_at: o.updated_at,
    store_id: getCurrentStoreId(),
  }
  const { error } = await supabase.from('orders').upsert(orderRow, { onConflict: 'id' })
  if (error) { console.warn('Sync order error:', error.message); return false }
  const items = o.items || []
  if (items.length) {
    const sid = getCurrentStoreId()
    const { error: ie } = await supabase.from('order_items').upsert(
      items.map((i: any) => ({
        id: i.id, order_id: order.id, product_id: i.product_id ?? '',
        product_name: i.product_name ?? '', quantity: i.quantity ?? 0,
        unit_price: i.unit_price ?? 0, preparation: i.preparation ?? '',
        total_price: i.total_price ?? 0, store_id: sid,
      })),
      { onConflict: 'id' }
    )
    if (ie) { console.warn('Sync order items error:', ie.message); return false }
  }
  return true
}

export async function syncOrderStatus(id: string, status: string) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id).then()
}

export async function syncCashFlow(entries: CashFlow[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('cash_flow').upsert(entries.map(e => ({ ...e, store_id: sid })), { onConflict: 'id' }).then()
}

export async function syncPurchases(purchases: any[]) {
  if (!isSupabaseReady() || !supabase || !purchases.length) return
  const sid = getCurrentStoreId()
  const { error } = await supabase.from('purchases').upsert(purchases.map(p => ({
    id: p.id, product_id: p.product_id ?? '', product_name: p.product_name ?? '',
    quantity: p.quantity ?? 0, unit_price: p.unit_price ?? 0, total_price: p.total_price ?? 0,
    supplier: p.supplier ?? '', created_at: p.created_at, store_id: sid,
  })), { onConflict: 'id' })
  if (error) console.error('[syncPurchases]', error.message)
}

export async function syncSettings(settings: StoreSettings) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  // id baseado no store_id para permitir multi-loja (uuid ou fallback '1')
  const rowId = sid ?? '1'
  supabase.from('store_settings').upsert(
    { id: rowId, ...settings, updated_at: new Date().toISOString(), store_id: sid },
    { onConflict: 'store_id' }
  ).then()
}

// ── LOJAS ─────────────────────────────────────────────────

export async function syncStore(store: {
  id?: string; name: string; slug?: string; address?: string; phone?: string;
  email?: string; whatsapp?: string; nif?: string; iva_rate?: number; active?: boolean
}): Promise<{ id: string } | null> {
  if (!isSupabaseReady() || !supabase) return null
  const row: any = {
    name: store.name,
    slug: store.slug || store.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    address: store.address ?? '',
    phone: store.phone ?? '',
    email: store.email ?? '',
    whatsapp: store.whatsapp ?? '',
    nif: store.nif ?? '',
    iva_rate: store.iva_rate ?? 14,
    active: store.active !== false,
    updated_at: new Date().toISOString(),
  }
  if (store.id) row.id = store.id
  const { data, error } = await supabase.from('stores').upsert(row, { onConflict: 'id' }).select('id').maybeSingle()
  if (error) { console.warn('[syncStore]', error.message); return null }
  return data
}

export async function deleteStore(id: string) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('stores').update({ active: false }).eq('id', id).then()
}

/**
 * Apaga permanentemente uma loja do Supabase.
 * Retorna { ok, error } para o chamador tratar.
 */
export async function deleteStorePermanent(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado' }
  const { error } = await supabase.from('stores').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function syncDeliveryZones(zones: DeliveryZone[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('delivery_zones').upsert(zones.map(z => ({ ...z, store_id: sid })), { onConflict: 'id' }).then()
}

export async function syncPromos(promos: PromoCode[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('promo_codes').upsert(promos.map(p => ({ ...p, store_id: sid })), { onConflict: 'id' }).then()
}

export async function syncSuppliers(suppliers: any[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('suppliers').upsert(suppliers.map(s => ({ ...s, store_id: sid })), { onConflict: 'id' }).then()
}

export async function syncReturns(returns_: any[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('returns').upsert(returns_.map(r => ({ ...r, store_id: sid })), { onConflict: 'id' }).then()
}

export async function syncLoyalty(transactions: any[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('loyalty_transactions').upsert(transactions.map(l => ({ ...l, store_id: sid })), { onConflict: 'id' }).then()
}

export async function syncShifts(shifts: any[]) {
  if (!isSupabaseReady() || !supabase || !shifts.length) return
  const sid = getCurrentStoreId()
  const { error } = await supabase.from('shift_sessions').upsert(shifts.map(s => ({
    id: s.id, opened_at: s.opened_at, closed_at: s.closed_at ?? null,
    opening_balance: s.opening_balance ?? 0, closing_balance: s.closing_balance ?? null,
    cash_counted: s.cash_counted ?? null, difference: s.difference ?? null,
    opened_by: s.opened_by ?? '', closed_by: s.closed_by ?? null, notes: s.notes ?? '',
    store_id: sid,
  })), { onConflict: 'id' })
  if (error) console.error('[syncShifts]', error.message)
}

// ── FLUXO DE CAIXA — novo sistema (cf_*) ─────────────────────

export async function syncCfAccounts(accounts: any[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('cf_accounts').upsert(
    accounts.map(a => ({
      id: a.id, name: a.name, balance: a.balance ?? 0,
      type: a.type ?? 'cash', color: a.color ?? '#06b6d4',
      store_id: sid, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'id' }
  ).then()
}

export async function syncCfCategories(categories: any[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('cf_categories').upsert(
    categories.map(c => ({
      id: c.id, name: c.name, type: c.type ?? 'expense',
      color: c.color ?? '#6b7280',
      store_id: sid, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'id' }
  ).then()
}

export async function syncCfMovements(movements: any[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  supabase.from('cf_movements').upsert(
    movements.map(m => ({
      id: m.id, date: m.date, type: m.type,
      description: m.description ?? '', amount: m.amount ?? 0,
      category: m.category ?? '', account: m.account ?? '',
      account_to: m.accountTo ?? null, reference: m.reference ?? null,
      created_at: m.created_at ?? new Date().toISOString(),
      store_id: sid,
    })),
    { onConflict: 'id' }
  ).then()
}

export async function deleteCfMovement(id: string) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('cf_movements').delete().eq('id', id).then()
}

export async function deleteCfAccount(id: string) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('cf_accounts').delete().eq('id', id).then()
}

export async function deleteCfCategory(id: string) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('cf_categories').delete().eq('id', id).then()
}

export async function deleteProduct(id: string) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('products').delete().eq('id', id).then()
}

export async function deleteCategory(id: string) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('categories').delete().eq('id', id).then()
}

export async function deleteZone(id: string) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('delivery_zones').delete().eq('id', id).then()
}

export async function deletePromo(id: string) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('promo_codes').delete().eq('id', id).then()
}

/**
 * Apaga TODOS os dados de negócio do Supabase.
 * Usa a função SQL reset_all_data() com SECURITY DEFINER para bypassar o RLS.
 * Fallback: delete directo tabela a tabela (menos fiável com RLS activo).
 */
export async function clearAllData(): Promise<void> {
  if (!isSupabaseReady() || !supabase) return

  // Tentativa 1: RPC com SECURITY DEFINER — bypassa RLS, apaga tudo garantidamente
  try {
    const { error } = await supabase.rpc('reset_all_data')
    if (!error) return   // sucesso — sai imediatamente
    console.warn('[clearAllData] RPC falhou:', error.message)
  } catch (e: any) {
    console.warn('[clearAllData] RPC exception:', e?.message)
  }

  // Fallback: delete directo (pode ser bloqueado por RLS mas tenta na mesma)
  const tables = [
    'order_items', 'orders', 'products', 'categories',
    'cash_flow', 'purchases', 'delivery_zones', 'promo_codes',
    'suppliers', 'returns', 'loyalty_transactions', 'shift_sessions',
  ]
  for (const table of tables) {
    try { await supabase.from(table).delete().not('id', 'is', null) } catch { }
  }
}

// ── NOTIFICAÇÃO DE NOVA ENCOMENDA com retry ────────────────────
// Tenta gravar no Supabase até 4 vezes com backoff crescente.
// Se gravar com sucesso, dispara broadcast para o Admin.
export async function notifyNewOrder(
  order: Order,
  orderNumber: string,
  total: number,
  customerName?: string,
): Promise<void> {
  if (!isSupabaseReady() || !supabase) return

  const delays = [0, 2000, 5000, 10000]
  let saved = false

  for (const delay of delays) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    saved = await syncOrder(order)
    if (saved) break
  }

  if (!saved) return

  // Broadcast para notificar o Admin em tempo real
  // Usa o mesmo canal 'admin-orders-main' que o Admin está a ouvir
  try {
    const bc = supabase.channel('admin-orders-main')
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { supabase!.removeChannel(bc); resolve() }, 5000)
      bc.subscribe(status => {
        if (status !== 'SUBSCRIBED') return
        clearTimeout(timeout)
        bc.send({
          type: 'broadcast',
          event: 'new_order',
          payload: { id: order.id, order_number: orderNumber, customer_name: customerName || 'Cliente', total },
        }).finally(() => { supabase!.removeChannel(bc); resolve() })
      })
    })
  } catch { /* non-fatal — postgres_changes já notifica o Admin */ }
}
