/**
 * Camada de sincronização Supabase ↔ localStorage
 * pullAll(): Supabase → localStorage
 * pushAll(): localStorage → Supabase
 */

import { supabase, isSupabaseReady } from './supabase'
import type { Order, Product, Category, CashFlow, Purchase, DeliveryZone, PromoCode } from '../types/database'
import type { StoreSettings } from './settings'

function ls<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function lsSet(key: string, v: any) { localStorage.setItem(key, JSON.stringify(v)) }

// ── PULL: Supabase → localStorage ─────────────────────────────
export async function pullAll(): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado' }

  try {
    const [cat, prod, ord, cf, pur, zones, promos, sets, sup, ret, loy, shifts, profiles] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('products').select('*').order('name'),
      supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }),
      supabase.from('cash_flow').select('*').order('created_at', { ascending: false }),
      supabase.from('purchases').select('*').order('created_at', { ascending: false }),
      supabase.from('delivery_zones').select('*').order('name'),
      supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('returns').select('*').order('created_at', { ascending: false }),
      supabase.from('loyalty_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('shift_sessions').select('*').order('opened_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false }),
    ])

    if (cat.data)    lsSet('khrismir_categories', cat.data)
    if (prod.data)   lsSet('khrismir_products', prod.data)
    if (ord.data) {
      const fromSupabase = ord.data.map(({ order_items, ...o }: any) => ({ ...o, items: order_items ?? [] }))
      // Preservar pedidos locais que ainda não chegaram ao Supabase
      const existing: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_orders') || '[]') } catch { return [] } })()
      const supabaseIds = new Set(fromSupabase.map((o: any) => o.id))
      const localOnly = existing.filter((o: any) => !supabaseIds.has(o.id))
      lsSet('khrismir_orders', [...localOnly, ...fromSupabase])
    }
    if (cf.data)     lsSet('khrismir_cashflow', cf.data)
    if (pur.data)    lsSet('khrismir_purchases', pur.data)
    if (zones.data)  lsSet('khrismir_delivery_zones', zones.data)
    if (promos.data) lsSet('khrismir_promos', promos.data)
    if (sets.data)   lsSet('khrismir_settings', sets.data)
    if (sup.data)    lsSet('khrismir_suppliers', sup.data)
    if (ret.data)    lsSet('khrismir_returns', ret.data)
    if (loy.data)    lsSet('khrismir_loyalty', loy.data)
    if (shifts.data) lsSet('khrismir_shifts', shifts.data)
    if (profiles.data && profiles.data.length > 0) {
      // Merge com clientes locais (sem sobrescrever contas de funcionários)
      const local: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_clients') || '[]') } catch { return [] } })()
      const supabaseIds = new Set(profiles.data.map((p: any) => p.id))
      const localOnly = local.filter((c: any) => !supabaseIds.has(c.id))
      lsSet('khrismir_clients', [...localOnly, ...profiles.data])
    }

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

  await upsert('categories', categories.map(c => ({
    id: c.id, name: c.name, description: c.description ?? '', image_url: c.image_url ?? '',
  })), 'Categorias')

  await upsert('products', products.map(p => ({
    id: p.id, name: p.name, price: p.price, cost_price: p.cost_price ?? 0,
    unit: p.unit, stock_quantity: p.stock_quantity, min_stock: p.min_stock,
    allow_whole: p.allow_whole, allow_clean: p.allow_clean,
    allow_fillet: p.allow_fillet, allow_steak: p.allow_steak,
    category_id: p.category_id, image_url: p.image_url ?? '',
    expiry_date: p.expiry_date ?? null, created_at: p.created_at,
  })), 'Produtos')

  // Encomendas — apenas colunas da tabela orders
  if (orders.length) {
    const orderRows = orders.map((o: any) => ({
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
    }))
    const { error: oe } = await supabase!.from('orders').upsert(orderRows, { onConflict: 'id' })
    if (oe) { details.push(`❌ Encomendas: ${oe.message}`); ok = false }
    else {
      const allItems = orders.flatMap((o: any) => (o.items || []).map((i: any) => ({
        id: i.id, order_id: o.id, product_id: i.product_id ?? '',
        product_name: i.product_name ?? '', quantity: i.quantity ?? 0,
        unit_price: i.unit_price ?? 0, preparation: i.preparation ?? '',
        total_price: i.total_price ?? 0,
      })))
      if (allItems.length) {
        const { error: ie } = await supabase!.from('order_items').upsert(allItems, { onConflict: 'id' })
        if (ie) { details.push(`❌ Itens encomendas: ${ie.message}`); ok = false }
        else details.push(`✅ Encomendas: ${orders.length} (${allItems.length} itens)`)
      } else {
        details.push(`✅ Encomendas: ${orders.length}`)
      }
    }
  } else {
    details.push('Encomendas: sem dados')
  }

  await upsert('cash_flow', cashFlow.map(c => ({
    id: c.id, type: c.type, amount: c.amount, description: c.description,
    order_number: (c as any).order_number ?? '', payment_type: (c as any).payment_type ?? '',
    created_at: c.created_at,
  })), 'Fluxo de Caixa')

  await upsert('purchases', purchases.map(p => ({
    id: (p as any).id, product_id: (p as any).product_id ?? '',
    product_name: (p as any).product_name ?? '', quantity: (p as any).quantity ?? 0,
    unit_price: (p as any).unit_price ?? 0, total_price: (p as any).total_price ?? 0,
    supplier: (p as any).supplier ?? '', created_at: (p as any).created_at,
  })), 'Compras')

  await upsert('delivery_zones', zones.map(z => ({
    id: z.id, name: z.name, price: z.price, description: z.description ?? '',
  })), 'Zonas de Entrega')

  await upsert('promo_codes', promos.map(p => ({
    id: p.id, code: p.code, discount_type: p.discount_type, discount_value: p.discount_value,
    min_order: p.min_order ?? 0, uses: p.uses ?? 0, max_uses: p.max_uses ?? null,
    expires_at: p.expires_at ?? null, active: p.active ?? true, created_at: p.created_at,
  })), 'Promoções')

  await upsert('suppliers', suppliers.map(s => ({
    id: s.id, name: s.name, nif: s.nif ?? '', phone: s.phone ?? '',
    email: s.email ?? '', address: s.address ?? '', notes: s.notes ?? '',
    created_at: s.created_at,
  })), 'Fornecedores')

  await upsert('returns', returns_.map(r => ({
    id: r.id, order_id: r.order_id ?? '', order_number: r.order_number,
    customer_name: r.customer_name ?? '', items: r.items ?? [],
    total: r.total ?? 0, reason: r.reason ?? '', created_at: r.created_at,
  })), 'Devoluções')

  await upsert('loyalty_transactions', loyalty.map(l => ({
    id: l.id, client_id: l.client_id ?? '', client_name: l.client_name ?? '',
    points: l.points ?? 0, type: l.type, order_id: l.order_id ?? '',
    created_at: l.created_at,
  })), 'Fidelização')

  await upsert('shift_sessions', shifts.map(s => ({
    id: s.id, opened_at: s.opened_at, closed_at: s.closed_at ?? null,
    opening_balance: s.opening_balance ?? 0, closing_balance: s.closing_balance ?? null,
    cash_counted: s.cash_counted ?? null, difference: s.difference ?? null,
    opened_by: s.opened_by ?? '', closed_by: s.closed_by ?? null, notes: s.notes ?? '',
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
  supabase.from('products').upsert(products.map(p => ({
    id: p.id, name: p.name, price: p.price, cost_price: p.cost_price ?? 0,
    unit: p.unit, stock_quantity: p.stock_quantity, min_stock: p.min_stock,
    allow_whole: p.allow_whole, allow_clean: p.allow_clean,
    allow_fillet: p.allow_fillet, allow_steak: p.allow_steak,
    category_id: p.category_id, image_url: p.image_url ?? '',
    expiry_date: p.expiry_date ?? null,
  })), { onConflict: 'id' }).then()
}

export async function syncCategories(categories: Category[]) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('categories').upsert(categories.map(c => ({
    id: c.id, name: c.name, description: c.description ?? '', image_url: c.image_url ?? '',
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
  }
  const { error } = await supabase.from('orders').upsert(orderRow, { onConflict: 'id' })
  if (error) { console.warn('Sync order error:', error.message); return false }
  const items = o.items || []
  if (items.length) {
    const { error: ie } = await supabase.from('order_items').upsert(
      items.map((i: any) => ({
        id: i.id, order_id: order.id, product_id: i.product_id ?? '',
        product_name: i.product_name ?? '', quantity: i.quantity ?? 0,
        unit_price: i.unit_price ?? 0, preparation: i.preparation ?? '',
        total_price: i.total_price ?? 0,
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
  supabase.from('cash_flow').upsert(entries, { onConflict: 'id' }).then()
}

export async function syncPurchases(purchases: Purchase[]) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('purchases').upsert(purchases, { onConflict: 'id' }).then()
}

export async function syncSettings(settings: StoreSettings) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('store_settings').upsert({ id: 1, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'id' }).then()
}

export async function syncDeliveryZones(zones: DeliveryZone[]) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('delivery_zones').upsert(zones, { onConflict: 'id' }).then()
}

export async function syncPromos(promos: PromoCode[]) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('promo_codes').upsert(promos, { onConflict: 'id' }).then()
}

export async function syncSuppliers(suppliers: any[]) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('suppliers').upsert(suppliers, { onConflict: 'id' }).then()
}

export async function syncReturns(returns_: any[]) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('returns').upsert(returns_, { onConflict: 'id' }).then()
}

export async function syncLoyalty(transactions: any[]) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('loyalty_transactions').upsert(transactions, { onConflict: 'id' }).then()
}

export async function syncShifts(shifts: any[]) {
  if (!isSupabaseReady() || !supabase) return
  supabase.from('shift_sessions').upsert(shifts, { onConflict: 'id' }).then()
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
