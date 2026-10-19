/**
 * Camada de sincronização Supabase ↔ localStorage
 * pullAll(): Supabase → localStorage
 * pushAll(): localStorage → Supabase
 */

import { supabase, isSupabaseReady } from './supabase'
import { getCurrentStoreId, BUSINESS_KEYS } from './storeContext'
import { isElectron, isEquipaActual, enqueueUpsert, enqueueDelete, confirmarEnvio, outbox, type OutboxEntry } from './localDB'
import { isCloudOnline, aoReligar, verificarAgora } from './connectivity'
import type { Order, Product, Category, CashFlow, Purchase, DeliveryZone, PromoCode } from '../types/database'
import type { StoreSettings } from './settings'

function ls<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function lsSet(key: string, v: any) { localStorage.setItem(key, JSON.stringify(v)) }

// Tombstone local de IDs eliminados — evita que o merge local+cloud do
// pullAll() "ressuscite" um registo que este dispositivo apagou (o Supabase
// já não o tem, mas a cache local antiga ainda tinha, e era tratada como
// "ainda não sincronizado" em vez de "apagado de propósito").
const DELETED_IDS_KEY = 'cf_deleted_ids'
const MAX_DELETED_IDS = 500
export function getDeletedIds(): Set<string> {
  return new Set(ls<string[]>(DELETED_IDS_KEY, []))
}
function markDeleted(id: string) {
  const ids = ls<string[]>(DELETED_IDS_KEY, [])
  if (!ids.includes(id)) lsSet(DELETED_IDS_KEY, [...ids, id].slice(-MAX_DELETED_IDS))
}


// Chaves de negócio isoladas por loja — limpas quando a loja muda (lista única, em storeContext)
const STORE_BUSINESS_KEYS = BUSINESS_KEYS.filter(k => k !== 'khrismir_last_pull_store')
const LAST_PULL_STORE_KEY = 'khrismir_last_pull_store'

/**
 * Electron: o SQLite deste computador é a fonte de verdade. O pull traz da nuvem
 * linhas novas e actualizações, mas NUNCA apaga uma linha local só porque a nuvem
 * não a tem (ainda não foi enviada, a nuvem foi limpa, a sessão não deixa ler...).
 * Antes, uma nuvem vazia ou incompleta apagava o trabalho local a cada arranque.
 * `uniqueBy`: o campo que a base de dados não deixa repetir (ex: nome do produto na
 * loja) — se a nuvem já tem uma linha com esse valor, a local com outro id é
 * um resíduo (ex: importação falhada) e descarta-se. Na Web mantém a substituição.
 */
function keepLocalRows<T extends Record<string, any>>(cloud: T[], lsKey: string, uniqueBy?: string): T[] {
  if (!isElectron()) return cloud
  const cloudIds = new Set(cloud.map(r => r.id))
  const cloudUnique = uniqueBy ? new Set(cloud.map(r => r[uniqueBy])) : null
  const seen = new Set<any>()
  const extra = ls<T[]>(lsKey, []).filter(r => {
    if (!r?.id || cloudIds.has(r.id)) return false
    if (uniqueBy) {
      if (cloudUnique!.has(r[uniqueBy]) || seen.has(r[uniqueBy])) return false
      seen.add(r[uniqueBy])
    }
    return true
  })
  return [...extra, ...cloud]
}

// ── PULL: Supabase → localStorage ─────────────────────────────
export async function pullAll(): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado' }
  // Sem ligação: não há nada a trazer da nuvem — a app fica com os dados locais (SQL),
  // intactos, em vez de lançar dezenas de pedidos que vão todos falhar.
  if (!isCloudOnline()) return { ok: false, error: 'Failed to fetch — sem ligação, a usar dados locais' }

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
      sf(supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(100)),
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
        ? supabase.from('profiles').select('*').eq('store_id', sid).order('created_at', { ascending: false })
        : supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    ])

    // Fluxo de caixa (novo sistema) + clientes PRIMAVERA — pull paralelo
    const [cfAccounts, cfCategories, cfMovements, storesData, primClients, accAccounts, journal, mapRefs] = await Promise.all([
      sf(supabase.from('cf_accounts').select('*').order('name')),
      sf(supabase.from('cf_categories').select('*').order('name')),
      sf(supabase.from('cf_movements').select('*').order('created_at', { ascending: false }).limit(300)),
      supabase.from('stores').select('*').eq('active', true).order('name'),
      sid
        ? supabase.from('clients').select('*').eq('store_id', sid).order('full_name')
        : supabase.from('clients').select('*').order('full_name'),
      sf(supabase.from('accounting_accounts').select('*').order('code')),
      sf(supabase.from('journal_entries').select('*').order('created_at', { ascending: false }).limit(500)),
      sf(supabase.from('map_references').select('*').order('name')),
    ])

    // SEMPRE escreve no localStorage — mesmo arrays vazios limpam dados da loja anterior.
    // Nunca usar "length > 0" aqui: uma loja nova com 0 movimentos deve limpar os
    // movimentos que ficaram de outra loja neste dispositivo.
    if (cfAccounts.data)   lsSet('cf_accounts',   keepLocalRows(cfAccounts.data, 'cf_accounts', 'name'))
    if (cfCategories.data) lsSet('cf_categories', keepLocalRows(cfCategories.data, 'cf_categories', 'name'))

    // cf_movements — merge local + Supabase (preserva movimentos locais não sincronizados)
    // Limitado a 300 registos para não encher o localStorage (~300 KB)
    if (cfMovements.data) {
      const fromSb = cfMovements.data.map((m: any) => ({ ...m, accountTo: m.account_to }))
      const localMvs: any[] = (() => { try { return JSON.parse(localStorage.getItem('cf_movements') || '[]') } catch { return [] } })()
      const sbIds = new Set(fromSb.map((m: any) => m.id))
      const deletedIds = getDeletedIds()
      // Preserva movimentos locais que ainda não chegaram ao Supabase (ex: vendas POS
      // recentes) — mas nunca um que este dispositivo apagou (cf_deleted_ids), senão a
      // próxima sincronização volta a enviá-lo e "ressuscita" um movimento eliminado.
      const localOnly = localMvs.filter((m: any) => m.id && !sbIds.has(m.id) && !deletedIds.has(m.id))
      const merged = [...localOnly, ...fromSb]
        .sort((a: any, b: any) =>
          new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime()
        )
        .slice(0, 300)  // máx 300 movimentos em cache local (~300 KB)
      lsSet('cf_movements', merged)
    }

    if (storesData.data)   mergeCloudStores(storesData.data)

    if (accAccounts.data && accAccounts.data.length > 0) lsSet('khrismir_accounts', keepLocalRows(accAccounts.data, 'khrismir_accounts', 'code'))
    if (mapRefs.data) lsSet('khrismir_map_references', keepLocalRows(mapRefs.data, 'khrismir_map_references'))

    // Lançamentos contabilísticos — merge local + Supabase (preserva lançamentos locais não sincronizados)
    if (journal.data) {
      const fromSb = journal.data
      const localEntries: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_journal') || '[]') } catch { return [] } })()
      const sbIds = new Set(fromSb.map((e: any) => e.id))
      const deletedIds = getDeletedIds()
      const localOnly = localEntries.filter((e: any) => e.id && !sbIds.has(e.id) && !deletedIds.has(e.id))
      const merged = [...localOnly, ...fromSb]
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 500)
      lsSet('khrismir_journal', merged)
    }

    if (cat.data)    lsSet('khrismir_categories', keepLocalRows(cat.data, 'khrismir_categories', 'name'))
    if (prod.data)   lsSet('khrismir_products', keepLocalRows(prod.data, 'khrismir_products', 'name'))
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

    // Purchases — merge local + Supabase, filtrando entradas com total_price <= 0
    if (pur.data) {
      const deletedPur = getDeletedIds()
      const validSb = pur.data.filter((p: any) => Number(p.total_price) > 0 && p.product_id && !deletedPur.has(p.id))
      const localPur: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_purchases') || '[]') } catch { return [] } })()
      const sbPurIds = new Set(validSb.map((p: any) => p.id))
      // Só preserva locais válidos (mesmo filtro: total_price > 0 e product_id existe)
      const localOnlyPur = localPur.filter((p: any) => p.id && !sbPurIds.has(p.id) && !deletedPur.has(p.id) && Number(p.total_price) > 0 && p.product_id)
      lsSet('khrismir_purchases', [...localOnlyPur, ...validSb])
    }

    if (zones.data)  lsSet('khrismir_delivery_zones', keepLocalRows(zones.data, 'khrismir_delivery_zones'))
    if (promos.data) lsSet('khrismir_promos', keepLocalRows(promos.data, 'khrismir_promos'))
    if (sets.data)   lsSet('khrismir_settings', sets.data)
    else {
      // Sem sessão de staff, store_settings não é legível (tem dados bancários).
      // O catálogo/checkout só precisa dos campos públicos (nome, WhatsApp,
      // coordenadas da loja...) — vêm de public_store_settings(), por cima da
      // cópia local, sem nunca apagar o que lá está.
      const pub = await (supabase as any).rpc('public_store_settings', { p_store_id: sid ?? null })
      if (pub?.data && typeof pub.data === 'object' && Object.keys(pub.data).length > 0) {
        const local = (() => { try { return JSON.parse(localStorage.getItem('khrismir_settings') || '{}') } catch { return {} } })()
        lsSet('khrismir_settings', { ...local, ...pub.data })
      }
    }
    if (sup.data)    lsSet('khrismir_suppliers', keepLocalRows(sup.data, 'khrismir_suppliers', 'name'))

    // Devoluções e fidelização — merge local + Supabase (preserva registos locais
    // ainda não sincronizados, em vez de os apagar com uma substituição directa)
    if (ret.data) {
      const localRet: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_returns') || '[]') } catch { return [] } })()
      const sbRetIds = new Set(ret.data.map((r: any) => r.id))
      const localOnlyRet = localRet.filter((r: any) => r.id && !sbRetIds.has(r.id))
      lsSet('khrismir_returns', [...localOnlyRet, ...ret.data])
    }
    if (loy.data) {
      const localLoy: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_loyalty') || '[]') } catch { return [] } })()
      const sbLoyIds = new Set(loy.data.map((l: any) => l.id))
      const localOnlyLoy = localLoy.filter((l: any) => l.id && !sbLoyIds.has(l.id))
      lsSet('khrismir_loyalty', [...localOnlyLoy, ...loy.data])
    }

    // Shifts — merge local + Supabase (preserva turnos locais que ainda não chegaram à cloud)
    if (shifts.data) {
      const localShifts: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_shifts') || '[]') } catch { return [] } })()
      // Filtra turnos do Supabase com opened_at inválido (null/undefined/não-parseável)
      const validSbShifts = shifts.data.filter((s: any) =>
        s.id && s.opened_at && !isNaN(new Date(s.opened_at).getTime())
      )
      const sbShiftIds = new Set(validSbShifts.map((s: any) => s.id))
      // Filtra também os locais com opened_at inválido
      const localOnlyShifts = localShifts.filter((s: any) =>
        s.id && !sbShiftIds.has(s.id) && s.opened_at && !isNaN(new Date(s.opened_at).getTime())
      )
      lsSet('khrismir_shifts', [...localOnlyShifts, ...validSbShifts])
    }
    if (profiles.data && profiles.data.length > 0) {
      // Traz TODOS os perfis (clientes, funcionários, gerentes, admins) — antes só
      // trazia clientes, por isso a Equipa aparecia vazia em qualquer dispositivo
      // que não fosse o que criou a conta.
      // A tabela profiles não guarda a password (fica só em auth.users) — preserva
      // a password local já existente em vez de a apagar ao fazer merge.
      const local: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_clients') || '[]') } catch { return [] } })()
      const localById = new Map(local.map((c: any) => [c.id, c]))
      const merged = profiles.data.map((p: any) => ({ ...p, password: localById.get(p.id)?.password }))
      const supabaseIds = new Set(profiles.data.map((p: any) => p.id))
      const localOnly = local.filter((c: any) => !supabaseIds.has(c.id))
      const allClients = [...localOnly, ...merged]
      lsSet('khrismir_clients', allClients)

      // Espelha os não-clientes também em khrismir_employees (é o que a Equipa lê)
      const employeeRoles = new Set(['employee', 'admin', 'gerente', 'super_admin'])
      lsSet('khrismir_employees', allClients.filter((c: any) => employeeRoles.has(c.role)))
    }

    // Merge clientes PRIMAVERA (tabela clients) no khrismir_clients
    if (primClients?.data && primClients.data.length > 0) {
      const existing: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_clients') || '[]') } catch { return [] } })()
      const existingIds = new Set(existing.map((c: any) => c.id))
      // Adiciona clientes PRIMAVERA que ainda não estão (por id)
      const novosPrim = primClients.data
        .filter((c: any) => !existingIds.has(c.id))
        .map((c: any) => ({ ...c, role: 'client', source: 'primavera' }))
      if (novosPrim.length > 0) {
        lsSet('khrismir_clients', [...existing, ...novosPrim])
      }
    }

    // Reaplica por cima da nuvem o que ainda está na fila offline por enviar —
    // senão o pull acima "apagava do ecrã" o trabalho feito sem sessão online.
    await applyPendingOutbox()

    // Uma só vez por loja: IVA a 0 e lançamentos antigos sem IVA (ver iniciarIvaZero)
    try { await (await import('./accounting')).iniciarIvaZero({ nuvem: true }) } catch { /* não bloqueia o pull */ }

    // Notifica todos os componentes que os dados foram actualizados
    window.dispatchEvent(new CustomEvent('khrismir:sync', { detail: { table: 'pullAll' } }))

    // Regista timestamp da última sincronização bem-sucedida
    localStorage.setItem('khrismir_last_sync', new Date().toISOString())

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}


// tabela da fila offline → chave do localStorage onde a app a lê
const OUTBOX_LS_KEY: Record<string, string> = {
  products: 'khrismir_products', categories: 'khrismir_categories', orders: 'khrismir_orders',
  purchases: 'khrismir_purchases', suppliers: 'khrismir_suppliers', shift_sessions: 'khrismir_shifts',
  delivery_zones: 'khrismir_delivery_zones', promo_codes: 'khrismir_promos',
  returns: 'khrismir_returns', loyalty_transactions: 'khrismir_loyalty',
  cf_accounts: 'cf_accounts', cf_categories: 'cf_categories', cf_movements: 'cf_movements',
  accounting_accounts: 'khrismir_accounts', journal_entries: 'khrismir_journal',
  map_references: 'khrismir_map_references',
}

/**
 * Electron e browser: o pullAll() substitui os dados locais pelos da nuvem. Tudo o que foi
 * escrito mas ainda não chegou ao Supabase (fila sync_outbox — por falta de
 * internet ou de sessão online) desaparecia do ecrã a cada arranque. Esta função
 * volta a aplicar a fila por cima: o último pedido de cada linha vence
 * (gravar = inserir/actualizar, apagar = remover).
 */
export async function applyPendingOutbox(): Promise<void> {
  const sid = getCurrentStoreId()
  if (!sid) return
  let pending: OutboxEntry[]
  try {
    // Entradas anteriores à separação por loja não têm dono: ficam com a loja aberta.
    await outbox().adoptOrphans(sid)
    pending = await outbox().getPendingOutbox()
  } catch { return }
  // Só o trabalho DESTA loja — o das outras lojas não pode aparecer aqui.
  pending = (pending ?? []).filter(e => e.store_id === sid)
  if (!pending.length) return

  // Estado final por tabela/linha (a fila vem ordenada por id).
  const last = new Map<string, typeof pending[number]>()
  for (const e of pending) last.set(`${e.table_name}\u0000${e.row_id}`, e)

  const arrays = new Map<string, any[]>()
  const load = (key: string) => {
    if (!arrays.has(key)) arrays.set(key, ls<any[]>(key, []))
    return arrays.get(key)!
  }

  for (const e of last.values()) {
    if (e.table_name === 'order_items') {
      // os itens vivem dentro da encomenda (campo items)
      const orders = load('khrismir_orders')
      const order = orders.find(o => o.id === e.payload?.order_id)
      if (!order || e.op === 'delete') continue
      order.items = [...(order.items ?? []).filter((i: any) => i.id !== e.row_id), e.payload]
      continue
    }
    const key = OUTBOX_LS_KEY[e.table_name]
    if (!key) continue // tabelas sem cópia em array (stores, store_settings) tratam-se à parte
    const arr = load(key)
    const idx = arr.findIndex(r => r.id === e.row_id)
    if (e.op === 'delete') {
      if (idx >= 0) arr.splice(idx, 1)
    } else if (idx >= 0) {
      // Produtos: o stock fica o da nuvem (acabado de trazer pelo pullAll) — o da fila
      // é o de quando a linha foi gravada e não conta as vendas feitas depois.
      if (e.table_name === 'products') {
        const { [COM_STOCK]: fixar, ...linha } = e.payload ?? {}
        arr[idx] = { ...arr[idx], ...linha, stock_quantity: fixar ? linha.stock_quantity : arr[idx].stock_quantity }
      } else {
        arr[idx] = { ...arr[idx], ...e.payload }
      }
    } else if (e.table_name === 'products' && arr.some(r => r.name === e.payload?.name)) {
      // A loja só tem um produto por nome (unique name+store_id). São resíduos de
      // importações que falharam por nome repetido — nunca chegaram a existir.
      continue
    } else {
      if (e.table_name === 'products') {
        const { [COM_STOCK]: _m, ...linha } = e.payload ?? {}
        arr.unshift({ stock_quantity: 0, ...linha })
      } else {
        arr.unshift(e.table_name === 'orders' ? { items: [], ...e.payload } : e.payload)
      }
    }
  }
  arrays.forEach((arr, key) => lsSet(key, arr))
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── PUSH: localStorage → Supabase ─────────────────────────────
export async function pushAll(): Promise<{ ok: boolean; error?: string; details: string[] }> {
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado', details: [] }
  if (!isCloudOnline()) return { ok: false, error: 'Sem ligação — os dados ficam guardados localmente e são enviados quando a internet voltar', details: [] }

  const details: string[] = []
  let ok = true

  const upsert = async (table: string, rows: any[], logName: string, onConflict = 'id') => {
    if (!rows.length) { details.push(`${logName}: sem dados`); return }
    const { error } = await supabase!.from(table).upsert(rows, { onConflict })
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
  const accAccounts: any[]                 = ls('khrismir_accounts', [])
  const journal:     any[]                 = ls('khrismir_journal', [])
  const mapRefs:     any[]                 = ls('khrismir_map_references', [])
  const cfAccounts:  any[]                 = ls('cf_accounts', [])
  const cfCategories: any[]                = ls('cf_categories', [])
  const cfMovements: any[]                 = ls('cf_movements', [])

  const sid = getCurrentStoreId()
  // Nunca escrever com store_id nulo — isto orfanaria os dados da loja
  // anterior (ficam com store_id: null e desaparecem de todos os
  // dispositivos). Sem loja seleccionada, não há para onde sincronizar.
  if (!sid) return { ok: false, error: 'Sem loja seleccionada — sincronização cancelada para evitar corromper dados', details: [] }

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
    expiry_date: p.expiry_date ?? null, barcode: p.barcode ?? null, discount: p.discount ?? 0, created_at: p.created_at,
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
        delivery_lat: o.delivery_lat ?? null, delivery_lng: o.delivery_lng ?? null,
        delivery_distance_km: o.delivery_distance_km ?? null,
        doc_type: o.doc_type ?? null, converted_to_order_id: o.converted_to_order_id ?? null,
        converted_from_order_id: o.converted_from_order_id ?? null,
        payment_status: o.payment_status ?? 'pago', paid_at: o.paid_at ?? null,
        payment_split: o.payment_split ?? null,
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

  // Filtra compras inválidas (formato antigo ou total_price <= 0) antes de enviar ao Supabase
  const validPurchases = purchases.filter(p => Number((p as any).total_price) > 0 && (p as any).product_id)
  await upsert('purchases', validPurchases.map(p => ({
    id: (p as any).id, product_id: (p as any).product_id ?? '',
    product_name: (p as any).product_name ?? '', quantity: (p as any).quantity ?? 0,
    unit_price: (p as any).unit_price ?? 0, total_price: (p as any).total_price ?? 0,
    supplier: (p as any).supplier ?? '', created_at: (p as any).created_at,
    payment_status: (p as any).payment_status ?? 'pago', paid_at: (p as any).paid_at ?? null,
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

  await upsert('suppliers', umPorNome(suppliers).map(s => ({
    id: s.id, name: s.name, nif: s.nif ?? '', phone: s.phone ?? '',
    email: s.email ?? '', address: s.address ?? '', notes: s.notes ?? '',
    created_at: s.created_at, store_id: sid,
  })), 'Fornecedores', 'name,store_id')

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
    opened_by: s.opened_by ?? '', opened_by_id: s.opened_by_id ?? null,
    closed_by: s.closed_by ?? null, notes: s.notes ?? '',
    store_id: sid,
  })), 'Turnos')

  await upsert('accounting_accounts', accAccounts.map(a => ({
    id: a.id, code: a.code, name: a.name, class: a.class,
    nature: a.nature, editable: a.editable ?? true, store_id: sid,
  })), 'Contas Contabilísticas')

  await upsert('journal_entries', journal.map(e => ({
    id: e.id, date: e.date, description: e.description ?? '',
    reference: e.reference ?? null, source: e.source ?? 'manual',
    lines: e.lines ?? [], created_at: e.created_at ?? new Date().toISOString(),
    store_id: sid,
  })), 'Lançamentos Contabilísticos')

  await upsert('map_references', mapRefs.map(p => ({
    id: p.id, name: p.name, lat: p.lat, lng: p.lng, store_id: sid,
  })), 'Pontos de Referência')

  // Contas/categorias/movimentos do Fluxo de Caixa — faltavam aqui por
  // completo. Tinham só sync incremental (syncCfAccounts/syncCfCategories/
  // syncCfMovements), nunca chamado num pushAll(). Isto fazia o "Restaurar
  // Backup" parecer incompleto: os movimentos sobreviviam (pullAll faz merge
  // local+cloud), mas as CONTAS e CATEGORIAS eram sempre reescritas a partir
  // da cloud (sem merge) — como nunca tinham sido reenviadas, a próxima
  // sincronização apagava-as outra vez.
  await upsert('cf_accounts', cfAccounts.map(a => ({
    id: a.id, name: a.name, balance: a.balance ?? 0,
    type: a.type ?? 'cash', color: a.color ?? '#06b6d4',
    store_id: sid, updated_at: new Date().toISOString(),
  })), 'Contas de Caixa')

  await upsert('cf_categories', cfCategories.map(c => ({
    id: c.id, name: c.name, type: c.type ?? 'expense',
    color: c.color ?? '#6b7280',
    store_id: sid, updated_at: new Date().toISOString(),
  })), 'Categorias de Caixa')

  await upsert('cf_movements', cfMovements.map(m => ({
    id: m.id, date: m.date, type: m.type,
    description: m.description ?? '', amount: m.amount ?? 0,
    category: m.category ?? '', account: m.account ?? '',
    account_to: m.accountTo ?? null, reference: m.reference ?? null,
    created_at: m.created_at ?? new Date().toISOString(),
    store_id: sid,
  })), 'Movimentos de Caixa')

  if (Object.keys(settings).length) {
    // Mesmo padrão de syncSettings(): "id" tem de ser igual ao store_id
    // (é a chave usada no onConflict) e store_id tem de ir sempre incluído —
    // sem isto, todas as lojas colidiam na mesma linha "id: 1" sem store_id,
    // e o pullAll() (que filtra por store_id) nunca encontrava essa linha.
    const { error } = await supabase!.from('store_settings').upsert(
      { id: sid, ...settings, store_id: sid, updated_at: new Date().toISOString() }, { onConflict: 'id' }
    )
    if (error) { details.push(`❌ Configurações: ${error.message}`); ok = false }
    else details.push('✅ Configurações')
  }

  return { ok, details }
}

// ── ESCRITAS INCREMENTAIS ─────────────────────────────────────

/**
 * Envia produtos para a nuvem. Por omissão SEM o stock: o stock muda por ajustes
 * no servidor (vendas: syncProductStock; compras/devoluções: ajustarStock), e esta
 * função recebe muitas vezes a lista inteira com o stock que ESTE dispositivo tinha
 * — enviá-lo desfazia as vendas feitas noutros dispositivos. Produto novo fica com
 * stock 0 (o valor por omissão). comStock: true só quando se quer mesmo fixar o
 * stock (contagem manual, zerar, importações) — e então passar só esses produtos.
 */
export async function syncProducts(products: Product[], opts: { comStock?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado' }
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncProducts] Sem loja seleccionada — sincronização cancelada'); return { ok: false, error: 'Sem loja seleccionada' } }
  const productRows = products.map(p => ({
    id: p.id, name: p.name, price: p.price, cost_price: p.cost_price ?? 0,
    unit: p.unit, stock_quantity: p.stock_quantity, min_stock: p.min_stock,
    allow_whole: p.allow_whole, allow_clean: p.allow_clean,
    allow_fillet: p.allow_fillet, allow_steak: p.allow_steak,
    // category_id NULL (não '') — string vazia viola a FK para categories(id)
    category_id: p.category_id || null, image_url: p.image_url ?? '',
    expiry_date: p.expiry_date ?? null, barcode: p.barcode ?? null, discount: p.discount ?? 0, store_id: sid,
  })).map(({ stock_quantity, ...resto }) => (opts.comStock ? { ...resto, stock_quantity } : resto))
  // Na fila, o marcador diz ao drainOutbox que este stock é para fixar mesmo.
  const marca = await enqueueUpsert('products', productRows.map(r => (opts.comStock ? { ...r, [COM_STOCK]: true } : r)))
  const { error } = await supabase.from('products').upsert(productRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('products', productRows, marca)
  if (error) { console.error('[syncProducts]', error.message); return { ok: false, error: error.message } }
  return { ok: true }
}

/** Marcador interno nas linhas de produtos da fila: "este stock é para fixar". */
const COM_STOCK = '__com_stock'

/**
 * Ajusta o stock de um produto no servidor por diferença (+ entrada, − saída) —
 * compras, compras apagadas, devoluções. Usa o mesmo RPC atómico das vendas
 * (stock − quantidade), com a quantidade negada; sem ligação/sessão fica na fila.
 */
export function ajustarStock(productId: string, delta: number): Promise<number | null> {
  if (!delta) return Promise.resolve(null)
  return syncProductStock(productId, -delta)
}

/**
 * Decrementa o stock de um produto atomicamente no Supabase via RPC.
 * Retorna o novo stock_quantity confirmado pelo servidor, ou null em caso de erro.
 * Actualiza também o localStorage com o valor autoritativo do servidor.
 */
export async function syncProductStock(productId: string, quantity: number): Promise<number | null> {
  // Se a baixa não chegar ao servidor (sem internet ou sem sessão de staff), fica na
  // fila para ser feita mais tarde — antes perdia-se e o stock na nuvem ficava errado.
  // id único: cada venda é uma baixa própria, nunca substitui outra.
  const enfileirar = () => enqueueUpsert(STOCK_QUEUE, [{
    id: `${productId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    product_id: productId, quantity,
  }])
  if (!isSupabaseReady() || !supabase) { enfileirar(); return null }
  try {
    const { data, error } = await supabase.rpc('decrement_product_stock', {
      p_product_id: productId,
      p_quantity: quantity,
      p_store_id: getCurrentStoreId(),
    })
    if (error || !data || !data.length) {
      console.warn('[syncProductStock] RPC error:', error?.message)
      // Sem linhas devolvidas = o RLS não deixou actualizar (sem sessão de staff).
      enfileirar()
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
    enfileirar()
    return null
  }
}

export async function syncCategories(categories: Category[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncCategories] Sem loja seleccionada — sincronização cancelada'); return }
  const categoryRows = categories.map(c => ({
    id: c.id, name: c.name, description: c.description ?? '', image_url: c.image_url ?? '',
    store_id: sid,
  }))
  const marca = await enqueueUpsert('categories', categoryRows) // fila local (Electron)
  const { error } = await supabase.from('categories').upsert(categoryRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('categories', categoryRows, marca)
  if (error) console.error('[syncCategories]', error.message)
}

function buildOrderRow(o: any, sid: string) {
  // customer_id deve ser UUID válido (Supabase Auth) — caso contrário null
  const customerId = o.customer_id && UUID_REGEX.test(o.customer_id) ? o.customer_id : null
  return {
    id: o.id, order_number: o.order_number,
    customer_id: customerId,
    customer_name: o.customer_name ?? '', customer_phone: o.customer_phone ?? '',
    customer_nif: o.customer_nif ?? '', status: o.status ?? 'pendente',
    payment_type: o.payment_type ?? 'dinheiro', delivery_type: o.delivery_type ?? 'retirada',
    delivery_zone: o.delivery_zone ?? '', delivery_fee: o.delivery_fee ?? 0,
    delivery_address: o.delivery_address ?? '', discount_code: o.discount_code ?? '',
    discount_amount: o.discount_amount ?? 0, subtotal: o.subtotal ?? o.total ?? 0,
    total: o.total ?? 0, notes: o.notes ?? '',
    delivery_lat: o.delivery_lat ?? null, delivery_lng: o.delivery_lng ?? null,
    delivery_distance_km: o.delivery_distance_km ?? null,
    doc_type: o.doc_type ?? null, converted_to_order_id: o.converted_to_order_id ?? null,
    converted_from_order_id: o.converted_from_order_id ?? null,
    payment_status: o.payment_status ?? 'pago', paid_at: o.paid_at ?? null,
    payment_split: o.payment_split ?? null,
    created_at: o.created_at, updated_at: o.updated_at,
    store_id: sid,
  }
}

function buildItemRows(o: any, sid: string) {
  return (o.items || []).map((i: any) => ({
    id: i.id, order_id: o.id, product_id: i.product_id ?? '',
    product_name: i.product_name ?? '', quantity: i.quantity ?? 0,
    unit_price: i.unit_price ?? 0, preparation: i.preparation ?? '',
    total_price: i.total_price ?? 0, store_id: sid,
  }))
}

export async function syncOrder(order: Order): Promise<boolean> {
  if (!isSupabaseReady() || !supabase) return false
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncOrder] Sem loja seleccionada — sincronização cancelada'); return false }
  const orderRow = buildOrderRow(order, sid)
  const itemRows = buildItemRows(order, sid)

  // Encomenda feita por um cliente (catálogo/carrinho) ou por um visitante: orders
  // só aceita escrita de staff, por isso vai pelo RPC registar_encomenda, que a cria
  // sempre como "pendente" e nunca altera uma encomenda que já exista.
  if (!isEquipaActual()) {
    const { error } = await (supabase as any).rpc('registar_encomenda', { p_order: orderRow, p_items: itemRows })
    // A função só existe depois da migração 20260827000000. Até lá (app nova, base
    // ainda antiga) grava como antes, para nenhuma encomenda online se perder.
    const semFuncao = error && (error.code === 'PGRST202' || error.code === '42883')
    if (!semFuncao) {
      if (error) { console.warn('Sync order error:', error.message); return false }
      return true
    }
  }

  // Equipa: a encomenda E os itens entram na fila antes de tentar enviar — antes os
  // itens só eram enfileirados se a encomenda passasse, e perdiam-se sem sessão.
  const marca = await enqueueUpsert('orders', [orderRow]) // só enfileira para a equipa (ver localDB.ts)
  const marcaItens = itemRows.length ? await enqueueUpsert('order_items', itemRows) : null
  const { error } = await supabase.from('orders').upsert(orderRow, { onConflict: 'id' })
  if (error) { console.warn('Sync order error:', error.message); return false }
  confirmarEnvio('orders', orderRow, marca)
  if (itemRows.length) {
    const { error: ie } = await supabase.from('order_items').upsert(itemRows, { onConflict: 'id' })
    if (ie) { console.warn('Sync order items error:', ie.message); return false }
    confirmarEnvio('order_items', itemRows, marcaItens)
  }
  return true
}

export async function syncOrderStatus(id: string, status: string) {
  // Fila: a linha inteira (um upsert só com id+status falha no NOT NULL de order_number).
  const sid = getCurrentStoreId()
  const local = ls<any[]>('khrismir_orders', []).find(o => o.id === id)
  const marca = local && sid ? await enqueueUpsert('orders', [buildOrderRow({ ...local, status }, sid)]) : null
  if (!isSupabaseReady() || !supabase) return
  const { data, error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('id')
  if (error) console.error('[syncOrderStatus]', error.message)
  else if (data && data.length) confirmarEnvio('orders', { id }, marca) // 0 linhas = RLS não deixou: fica na fila
}

export async function syncCashFlow(entries: CashFlow[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncCashFlow] Sem loja seleccionada — sincronização cancelada'); return }
  const { error } = await supabase.from('cash_flow').upsert(entries.map(e => ({ ...e, store_id: sid })), { onConflict: 'id' })
  if (error) console.error('[syncCashFlow]', error.message)
}

export async function syncPurchases(purchases: any[]) {
  if (!isSupabaseReady() || !supabase || !purchases.length) return
  // Nunca enviar compras com total_price <= 0 (formato antigo ou dados inválidos)
  const valid = purchases.filter(p => Number(p.total_price) > 0 && p.product_id)
  if (!valid.length) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncPurchases] Sem loja seleccionada — sincronização cancelada'); return }
  const purchaseRows = valid.map(p => ({
    id: p.id, product_id: p.product_id ?? '', product_name: p.product_name ?? '',
    quantity: p.quantity ?? 0, unit_price: p.unit_price ?? 0, total_price: p.total_price ?? 0,
    supplier: p.supplier ?? '', created_at: p.created_at,
    payment_status: p.payment_status ?? 'pago', paid_at: p.paid_at ?? null,
    store_id: sid,
  }))
  const marca = await enqueueUpsert('purchases', purchaseRows) // fila local (Electron)
  const { error } = await supabase.from('purchases').upsert(purchaseRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('purchases', purchaseRows, marca)
  if (error) console.error('[syncPurchases]', error.message)
}

/** Apaga compras (local + nuvem). Marca-as como apagadas para o pull não as devolver. */
export async function deletePurchases(ids: string[]) {
  if (!ids.length) return
  ids.forEach(id => { markDeleted(id); enqueueDelete('purchases', id) }) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('purchases').delete().in('id', ids)
  if (error) console.error('[deletePurchases]', error.message)
}

export async function syncSettings(settings: StoreSettings) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  // id baseado no store_id para permitir multi-loja (uuid ou fallback '1')
  const rowId = sid ?? '1'
  // "id" já é sempre igual ao store_id nesta escrita (rowId acima) — usa "id"
  // no onConflict porque é a chave primária (garantidamente única); store_id
  // nunca teve uma constraint de unicidade própria na base de dados.
  const settingsRow = { id: rowId, ...settings, updated_at: new Date().toISOString(), store_id: sid }
  const marca = await enqueueUpsert('store_settings', [settingsRow]) // fila local (Electron)
  const { error } = await supabase.from('store_settings').upsert(settingsRow, { onConflict: 'id' })
  if (error) console.error('[syncSettings]', error.message)
  else confirmarEnvio('store_settings', settingsRow, marca)
}

// ── LOJAS ─────────────────────────────────────────────────

// Lojas são "local primeiro": criar/editar uma loja grava SEMPRE em
// khrismir_stores (com pending_sync=true) e nunca falha por falta de Supabase.
// O envio para a nuvem é best-effort — se falhar, a loja fica marcada como
// pendente e syncPendingStores() volta a tentar (ao arrancar, a cada 30s e
// quando a internet volta).
const STORES_KEY = 'khrismir_stores'

export function getLocalStores(): any[] {
  return ls<any[]>(STORES_KEY, [])
}

/**
 * Junta as lojas vindas da nuvem com as locais ainda por enviar — sem isto, um
 * pullAll()/listagem substituía a lista e fazia "desaparecer" uma loja acabada
 * de criar sem internet. Grava o resultado em localStorage e devolve-o.
 */
export function mergeCloudStores(cloud: any[]): any[] {
  const cloudIds = new Set(cloud.map(s => s.id))
  const pending = getLocalStores().filter(s => s.pending_sync && !cloudIds.has(s.id))
  const merged = [...cloud, ...pending]
  lsSet(STORES_KEY, merged)
  return merged
}

async function pushPendingStore(id: string): Promise<boolean> {
  if (!isSupabaseReady() || !supabase) return false
  const store = getLocalStores().find(s => s.id === id)
  if (!store) return true
  const { pending_sync: _pending, ...row } = store
  try {
    const { error } = await supabase.from('stores').upsert(row, { onConflict: 'id' })
    if (error) { console.warn('[syncStore]', error.message); return false }
  } catch (e: any) {
    console.warn('[syncStore] sem ligação:', e?.message)
    return false
  }
  lsSet(STORES_KEY, getLocalStores().map(s => {
    if (s.id !== id) return s
    const { pending_sync: _p, ...synced } = s
    return synced
  }))
  return true
}

export async function syncPendingStores() {
  for (const s of getLocalStores().filter(x => x.pending_sync)) await pushPendingStore(s.id)
}

export function startPendingStoresSync() {
  syncPendingStores()
  setInterval(() => { if (isCloudOnline()) syncPendingStores() }, 30_000)
  aoReligar(syncPendingStores) // voltou a haver ligação: envia já as lojas criadas offline
}

export async function syncStore(store: {
  id?: string; name: string; slug?: string; address?: string; phone?: string;
  email?: string; whatsapp?: string; nif?: string; iva_rate?: number; active?: boolean
}): Promise<{ id: string }> {
  const id = store.id ?? crypto.randomUUID()
  const row = {
    id,
    name: store.name,
    slug: store.slug || store.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    address: store.address ?? '',
    phone: store.phone ?? '',
    email: store.email ?? '',
    whatsapp: store.whatsapp ?? '',
    nif: store.nif ?? '',
    iva_rate: store.iva_rate ?? 0,
    active: store.active !== false,
    updated_at: new Date().toISOString(),
  }
  const local = getLocalStores()
  const idx = local.findIndex(s => s.id === id)
  const entry = { ...(idx >= 0 ? local[idx] : {}), ...row, pending_sync: true }
  if (idx >= 0) local[idx] = entry; else local.push(entry)
  lsSet(STORES_KEY, local)

  await pushPendingStore(id)
  return { id }
}

// ── PONTOS DE REFERÊNCIA DO MAPA (entrega por distância) ───────

export async function syncMapReferences(points: any[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncMapReferences] Sem loja seleccionada — sincronização cancelada'); return }
  const pointRows = points.map(p => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, store_id: sid }))
  const marca = await enqueueUpsert('map_references', pointRows) // fila local (Electron)
  const { error } = await supabase.from('map_references').upsert(pointRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('map_references', pointRows, marca)
  if (error) console.error('[syncMapReferences]', error.message)
}

export async function deleteMapReference(id: string) {
  enqueueDelete('map_references', id) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('map_references').delete().eq('id', id)
  if (error) console.error('[deleteMapReference]', error.message)
}

/**
 * Apaga permanentemente uma loja do Supabase.
 * Retorna { ok, error } para o chamador tratar.
 */
export async function deleteStorePermanent(id: string): Promise<{ ok: boolean; error?: string }> {
  // Loja que nunca chegou ao Supabase: não há nada para apagar lá.
  if (getLocalStores().find(s => s.id === id)?.pending_sync) return { ok: true }
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado' }
  const { error } = await supabase.from('stores').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Conta um uso de um código de desconto (checkout do catálogo). promo_codes só
 * aceita escrita de staff — o cliente usa o RPC usar_promo, que só soma 1.
 */
export async function usarPromo(promoId: string): Promise<void> {
  if (!isSupabaseReady() || !supabase) return
  const { error } = await (supabase as any).rpc('usar_promo', { p_promo_id: promoId })
  if (!error) return
  if (error.code === 'PGRST202' || error.code === '42883') {
    // Base ainda sem a migração 20260827000000: grava como antes.
    const promo = ls<PromoCode[]>('khrismir_promos', []).find(p => p.id === promoId)
    if (promo) await syncPromos([promo])
    return
  }
  console.error('[usarPromo]', error.message)
}

export async function syncPromos(promos: PromoCode[]): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado' }
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncPromos] Sem loja seleccionada — sincronização cancelada'); return { ok: false, error: 'Sem loja seleccionada' } }
  const promoRows = promos.map(p => ({ ...p, store_id: sid }))
  const marca = await enqueueUpsert('promo_codes', promoRows) // fila local (Electron)
  const { error } = await supabase.from('promo_codes').upsert(promoRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('promo_codes', promoRows, marca)
  if (error) { console.error('[syncPromos]', error.message); return { ok: false, error: error.message } }
  return { ok: true }
}

/**
 * Fornecedores: a nuvem só aceita um por nome em cada loja (suppliers_name_store_id_key).
 * Este dispositivo chegou a ter 3 cópias do mesmo fornecedor com ids diferentes, e o
 * envio falhava sempre com "duplicate key". Envia-se um por nome (o mais recente) e, se
 * a nuvem já tiver esse nome com outro id, actualiza-se essa linha em vez de dar erro.
 * Nada referencia o id do fornecedor (as compras guardam o nome), por isso é seguro.
 */
function umPorNome<T extends { name?: string; created_at?: string }>(rows: T[]): T[] {
  const porNome = new Map<string, T>()
  for (const r of rows) {
    const k = (r.name ?? '').trim().toLowerCase()
    const atual = porNome.get(k)
    if (!atual || (r.created_at ?? '') > (atual.created_at ?? '')) porNome.set(k, r)
  }
  return [...porNome.values()]
}

export async function syncSuppliers(suppliers: any[]): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady() || !supabase) return { ok: false, error: 'Supabase não configurado' }
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncSuppliers] Sem loja seleccionada — sincronização cancelada'); return { ok: false, error: 'Sem loja seleccionada' } }
  const supplierRows = umPorNome(suppliers).map(s => ({ ...s, store_id: sid }))
  const marca = await enqueueUpsert('suppliers', supplierRows) // fila local (Electron)
  const { error } = await supabase.from('suppliers').upsert(supplierRows, { onConflict: 'name,store_id' })
  if (!error) confirmarEnvio('suppliers', supplierRows, marca)
  if (error) { console.error('[syncSuppliers]', error.message); return { ok: false, error: error.message } }
  return { ok: true }
}

export async function deleteSupplier(id: string) {
  enqueueDelete('suppliers', id) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) console.error('[deleteSupplier]', error.message)
}

export async function syncShifts(shifts: any[]) {
  if (!isSupabaseReady() || !supabase || !shifts.length) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncShifts] Sem loja seleccionada — sincronização cancelada'); return }
  const shiftRows = shifts.map(s => ({
    id: s.id, opened_at: s.opened_at, closed_at: s.closed_at ?? null,
    opening_balance: s.opening_balance ?? 0, closing_balance: s.closing_balance ?? null,
    cash_counted: s.cash_counted ?? null, difference: s.difference ?? null,
    opened_by: s.opened_by ?? '', opened_by_id: s.opened_by_id ?? null,
    closed_by: s.closed_by ?? null, notes: s.notes ?? '',
    store_id: sid,
  }))
  const marca = await enqueueUpsert('shift_sessions', shiftRows) // fila local (Electron)
  const { error } = await supabase.from('shift_sessions').upsert(shiftRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('shift_sessions', shiftRows, marca)
  if (error) console.error('[syncShifts]', error.message)
}

// ── FLUXO DE CAIXA — novo sistema (cf_*) ─────────────────────

export async function syncCfAccounts(accounts: any[]) {
  const marca = await enqueueUpsert('cf_accounts', accounts) // fila local (Electron) — garante envio mesmo se o pedido abaixo falhar offline
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncCfAccounts] Sem loja seleccionada — sincronização cancelada'); return }
  const { error } = await supabase.from('cf_accounts').upsert(
    accounts.map(a => ({
      id: a.id, name: a.name, balance: a.balance ?? 0,
      type: a.type ?? 'cash', color: a.color ?? '#06b6d4',
      store_id: sid, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'id' }
  )
  if (error) console.error('[syncCfAccounts]', error.message)
  else confirmarEnvio('cf_accounts', accounts, marca)
}

export async function syncCfCategories(categories: any[]) {
  const marca = await enqueueUpsert('cf_categories', categories) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncCfCategories] Sem loja seleccionada — sincronização cancelada'); return }
  const { error } = await supabase.from('cf_categories').upsert(
    categories.map(c => ({
      id: c.id, name: c.name, type: c.type ?? 'expense',
      color: c.color ?? '#6b7280',
      store_id: sid, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'id' }
  )
  if (error) console.error('[syncCfCategories]', error.message)
  else confirmarEnvio('cf_categories', categories, marca)
}

export async function syncCfMovements(movements: any[]) {
  const marca = await enqueueUpsert('cf_movements', movements) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncCfMovements] Sem loja seleccionada — sincronização cancelada'); return }
  const { error } = await supabase.from('cf_movements').upsert(
    movements.map(m => ({
      id: m.id, date: m.date, type: m.type,
      description: m.description ?? '', amount: m.amount ?? 0,
      category: m.category ?? '', account: m.account ?? '',
      account_to: m.accountTo ?? null, reference: m.reference ?? null,
      created_at: m.created_at ?? new Date().toISOString(),
      store_id: sid,
    })),
    { onConflict: 'id' }
  )
  if (error) console.error('[syncCfMovements]', error.message)
  else confirmarEnvio('cf_movements', movements, marca)
}

export async function deleteCfMovement(id: string) {
  markDeleted(id)
  enqueueDelete('cf_movements', id) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('cf_movements').delete().eq('id', id)
  if (error) console.error('[deleteCfMovement]', error.message)
}

export async function deleteCfAccount(id: string) {
  enqueueDelete('cf_accounts', id) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('cf_accounts').delete().eq('id', id)
  if (error) console.error('[deleteCfAccount]', error.message)
}

export async function deleteCfCategory(id: string) {
  enqueueDelete('cf_categories', id) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('cf_categories').delete().eq('id', id)
  if (error) console.error('[deleteCfCategory]', error.message)
}

// ── Fila de envio offline (Electron) ─────────────────────────
//
// Substitui o "faz-e-esquece": no Electron, cada chamada enqueueUpsert/
// enqueueDelete (localDB.ts) regista a escrita em sync_outbox (SQLite) até
// ser confirmada no Supabase. drainOutbox() lê os pendentes, tenta enviá-los,
// e só marca como sincronizado o que realmente confirmou — uma falha de rede
// ou de sessão deixa a linha na fila para a próxima tentativa, em vez de
// desaparecer silenciosamente (foi exactamente a falta disto que causou
// vários bugs de perda de dados nesta app).
//
// cf_accounts/cf_categories/cf_movements enfileiram a linha em bruto (antes
// de mapear para colunas do Supabase) — por isso precisam de uma função de
// mapeamento aqui. As restantes tabelas já enfileiram a linha pronta a
// enviar (mapeada antes de chamar enqueueUpsert), por isso dispensam entrada
// neste mapa — drainOutbox usa o payload tal e qual nesses casos.
const UPSERT_MAP: Record<string, (row: any, sid: string) => any> = {
  cf_accounts: (a, sid) => ({
    id: a.id, name: a.name, balance: a.balance ?? 0,
    type: a.type ?? 'cash', color: a.color ?? '#06b6d4',
    store_id: sid, updated_at: new Date().toISOString(),
  }),
  cf_categories: (c, sid) => ({
    id: c.id, name: c.name, type: c.type ?? 'expense',
    color: c.color ?? '#6b7280',
    store_id: sid, updated_at: new Date().toISOString(),
  }),
  cf_movements: (m, sid) => ({
    id: m.id, date: m.date, type: m.type,
    description: m.description ?? '', amount: m.amount ?? 0,
    category: m.category ?? '', account: m.account ?? '',
    account_to: m.accountTo ?? m.account_to ?? null, reference: m.reference ?? null,
    created_at: m.created_at ?? new Date().toISOString(),
    store_id: sid,
  }),
}

let draining = false

/**
 * Produto vindo da fila. O stock de um produto que já existe na nuvem NUNCA é
 * reescrito a partir da fila: as vendas baixam-no no servidor (RPC
 * decrement_product_stock), e a linha guardada na fila tem o stock da altura em
 * que foi gravada. Enviá-la por inteiro desfazia essas baixas — visto ao vivo em
 * 2026-10-19: Cachucho 16,75 na nuvem voltaria a 35,15 (stock de antes da venda).
 * Só um produto novo (que ainda não existe) é criado com o stock da fila.
 */
async function enviarProdutoDaFila(row: any): Promise<{ error: any }> {
  const { stock_quantity: _stock, ...semStock } = row
  // Linhas antigas da fila têm stock; as novas (syncProducts sem comStock) não —
  // produto novo sem stock na linha fica com o valor por omissão da tabela (0).
  const upd = await supabase!.from('products').update(semStock).eq('id', row.id).select('id')
  if (upd.error) return { error: upd.error }
  if (upd.data && upd.data.length > 0) return { error: null }
  const ins = await supabase!.from('products').insert(row)
  return { error: ins.error }
}

/** "Tabela" da fila para baixas de stock por fazer (RPC decrement_product_stock). */
const STOCK_QUEUE = '__baixa_stock'

/**
 * Há uma sessão real do Supabase (conta registada na nuvem)? As tabelas internas
 * (caixa, contabilidade, compras, turnos...) só aceitam upsert/update/delete de
 * sessões autenticadas — com a conta local de recurso (sem sessão) o Supabase
 * recusa com "row-level security policy". Sem sessão a fila espera, em vez de
 * falhar a cada tentativa.
 */
export async function hasCloudSession(): Promise<boolean> {
  if (!isSupabaseReady() || !supabase) return false
  try {
    const { data } = await supabase.auth.getSession()
    return !!data.session
  } catch {
    return false
  }
}

const PAPEIS_STAFF = new Set(['admin', 'employee', 'gerente', 'super_admin'])
let staffCache: { uid: string; staff: boolean; at: number } | null = null

/**
 * Há uma sessão real do Supabase de um membro da EQUIPA? As tabelas internas
 * (caixa, contabilidade, compras, turnos, clientes...) só aceitam leitura e
 * escrita de staff (migração 20260826010000). Uma sessão de cliente não serve:
 * com RLS, um DELETE sem permissão não dá erro (apaga 0 linhas) e a entrada da
 * fila seria marcada como enviada sem nunca ter chegado — por isso a fila
 * espera por staff, não por "qualquer sessão".
 */
export async function hasStaffSession(): Promise<boolean> {
  if (!isSupabaseReady() || !supabase) return false
  try {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user?.id
    if (!uid) return false
    if (staffCache && staffCache.uid === uid && Date.now() - staffCache.at < 60_000) return staffCache.staff
    const { data: perfil, error } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle()
    if (error) return false // não guarda em cache: pode ser falha de rede passageira
    const staff = PAPEIS_STAFF.has((perfil as any)?.role ?? '')
    staffCache = { uid, staff, at: Date.now() }
    return staff
  } catch {
    return false
  }
}

/** Erro de política RLS do Postgres: quase sempre significa "sem sessão da cloud". */
export function isRlsError(msg: string): boolean {
  return /row-level security|violates row-level|permission denied/i.test(msg)
}

export async function drainOutbox(): Promise<void> {
  if (draining) return
  if (!isSupabaseReady() || !supabase) return
  if (!isCloudOnline()) return // sem ligação a fila espera, guardada no SQLite
  if (!(await hasStaffSession())) return // espera por uma sessão real de staff; a fila fica guardada

  draining = true
  try {
    const current = getCurrentStoreId()
    if (current) await outbox().adoptOrphans(current) // entradas antigas, sem loja
    const pending: OutboxEntry[] = await outbox().getPendingOutbox()
    if (!pending.length) return

    const synced: number[] = []
    for (const entry of pending) {
      // Cada entrada vai para a loja a que pertence — nunca para a que está aberta agora.
      const entrySid = entry.store_id
      if (!entrySid) continue
      // cf_accounts/cf_categories/cf_movements guardam a linha em bruto (precisa de
      // mapear para o formato do Supabase); as restantes tabelas já guardam a linha
      // pronta a enviar (foi construída antes de ser enfileirada), usa-se tal e qual.
      // Baixa de stock pendente (ver syncProductStock): não é uma linha, é uma chamada
      // ao RPC atómico — por isso vai à parte e nunca é "substituída" por outra.
      if (entry.table_name === STOCK_QUEUE) {
        const p = entry.payload ?? {}
        const { error } = await supabase.rpc('decrement_product_stock', {
          p_product_id: p.product_id, p_quantity: p.quantity, p_store_id: entrySid,
        })
        if (error) { console.error('[drainOutbox] baixa de stock', error.message); continue }
        synced.push(entry.id)
        continue
      }
      const mapRow = UPSERT_MAP[entry.table_name]
      const row = mapRow ? mapRow(entry.payload, entrySid) : { ...entry.payload, store_id: entry.payload?.store_id ?? entrySid }

      const { error } = entry.op === 'delete'
        ? await supabase.from(entry.table_name).delete().eq('id', entry.row_id)
        : entry.table_name === 'products'
          ? (row[COM_STOCK]
              ? await supabase.from('products').upsert((({ [COM_STOCK]: _m, ...r }) => r)(row), { onConflict: 'id' })
              : await enviarProdutoDaFila(row))
          : await supabase.from(entry.table_name).upsert(row, { onConflict: entry.table_name === 'suppliers' ? 'name,store_id' : 'id' })

      if (error) {
        if (error.code === '23505' && (entry.table_name === 'orders' || entry.table_name === 'order_items')) {
          // Encomenda/factura com número repetido (ex: o POS e as Facturas FA usam contadores
          // diferentes e ambos geram 2026/001). É uma venda real — NUNCA se descarta: fica
          // na fila até alguém resolver o número. Visto ao vivo: factura FA 2026/001 da
          // DUBENGO (260 000 Kz, fiado) bateu com a venda POS 2026/001 de 18/10.
          console.error(`[drainOutbox] ${entry.table_name}/${entry.row_id} NÃO enviada — número repetido:`, error.message)
          continue
        }
        if (error.code === '23505') {
          // Duplicado (ex: nome de produto repetido): nunca vai passar, por mais que se
          // repita. Descarta em vez de ficar preso na fila para sempre.
          console.warn(`[drainOutbox] ${entry.table_name}/${entry.row_id} descartado (duplicado):`, error.message)
          synced.push(entry.id)
          continue
        }
        console.error(`[drainOutbox] ${entry.table_name}/${entry.op}`, error.message)
        continue // fica na fila, tenta-se outra vez na próxima passagem
      }
      synced.push(entry.id)
    }

    if (synced.length) await outbox().markSynced(synced)
  } finally {
    draining = false
  }
}

/** Arranca o envio periódico da fila offline — chamar uma vez, no arranque da app. */
export function startOutboxDrain() {
  drainOutbox()
  setInterval(drainOutbox, 30_000)
  // Voltou a haver ligação (verificada de verdade, ver connectivity.ts): envia a fila
  // que se acumulou offline e vai buscar o que mudou nos outros dispositivos.
  aoReligar(async () => {
    await drainOutbox()
    await pullAll()
  })
}

/** Quantas alterações locais ainda esperam para ir para a nuvem. */
export async function contarPendentes(): Promise<number> {
  try {
    const p = await outbox().getPendingOutbox()
    return Array.isArray(p) ? p.length : 0
  } catch { return 0 }
}

export type ResultadoSincronizar =
  | { estado: 'sem-ligacao' }
  | { estado: 'sem-sessao'; pendentes: number }
  | { estado: 'ok'; enviados: number; pendentes: number; erro?: string }

/**
 * Botão "Sincronizar agora": volta a testar a ligação e, se houver internet, envia
 * tudo o que ficou guardado localmente e vai buscar as novidades da nuvem.
 */
export async function sincronizarAgora(): Promise<ResultadoSincronizar> {
  if (!(await verificarAgora())) return { estado: 'sem-ligacao' }
  const antes = await contarPendentes()
  if (!(await hasStaffSession())) return { estado: 'sem-sessao', pendentes: antes }
  await syncPendingStores()
  await drainOutbox()
  const pull = await pullAll()
  const depois = await contarPendentes()
  return { estado: 'ok', enviados: Math.max(0, antes - depois), pendentes: depois, erro: pull.ok ? undefined : pull.error }
}

export async function deleteJournalEntry(id: string) {
  markDeleted(id)
  enqueueDelete('journal_entries', id) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('journal_entries').delete().eq('id', id)
  if (error) console.error('[deleteJournalEntry]', error.message)
}

/** Apaga TODOS os lançamentos do diário da loja actual (zerar a contabilidade). */
export async function clearJournalEntries(ids: string[] = []): Promise<{ ok: boolean; error?: string }> {
  // Marca cada lançamento como apagado ANTES de qualquer outra coisa: sem isto, os que
  // ainda estavam na fila de envio (offline) eram reaplicados no arranque seguinte e o
  // Diário "voltava" depois de zerado. Junta os ids que a fila ainda tem para esta loja.
  const todos = new Set(ids)
  const lojaAtual = getCurrentStoreId()
  if (lojaAtual) {
    try {
      const pend: OutboxEntry[] = await outbox().getPendingOutbox()
      pend.filter(e => e.table_name === 'journal_entries' && e.store_id === lojaAtual).forEach(e => todos.add(e.row_id))
    } catch { /* sem fila — só os ids recebidos */ }
  }
  todos.forEach(id => { markDeleted(id); enqueueDelete('journal_entries', id) })

  if (!isSupabaseReady() || !supabase) return { ok: true } // sem cloud — só local mesmo
  const sid = getCurrentStoreId()
  if (!sid) return { ok: false, error: 'Sem loja seleccionada' }
  const { error } = await supabase.from('journal_entries').delete().eq('store_id', sid)
  if (error) { console.error('[clearJournalEntries]', error.message); return { ok: false, error: error.message } }
  return { ok: true }
}

// ── CONTABILIDADE (PGC-AO) ────────────────────────────────────

export async function syncAccountingAccounts(accounts: any[]) {
  if (!isSupabaseReady() || !supabase) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncAccountingAccounts] Sem loja seleccionada — sincronização cancelada'); return }
  const accountRows = accounts.map(a => ({
    id: a.id, code: a.code, name: a.name, class: a.class,
    nature: a.nature, editable: a.editable ?? true,
    store_id: sid,
  }))
  const marca = await enqueueUpsert('accounting_accounts', accountRows) // fila local (Electron)
  const { error } = await supabase.from('accounting_accounts').upsert(accountRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('accounting_accounts', accountRows, marca)
  if (error) console.error('[syncAccountingAccounts]', error.message)
}

export async function syncJournalEntries(entries: any[]) {
  if (!isSupabaseReady() || !supabase || !entries.length) return
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncJournalEntries] Sem loja seleccionada — sincronização cancelada'); return }
  const entryRows = entries.map(e => ({
    id: e.id, date: e.date, description: e.description ?? '',
    reference: e.reference ?? null, source: e.source ?? 'manual',
    lines: e.lines ?? [], created_at: e.created_at ?? new Date().toISOString(),
    store_id: sid,
  }))
  const marca = await enqueueUpsert('journal_entries', entryRows) // fila local (Electron)
  const { error } = await supabase.from('journal_entries').upsert(entryRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('journal_entries', entryRows, marca)
  if (error) console.error('[syncJournalEntries]', error.message)
}

export async function deleteProduct(id: string) {
  enqueueDelete('products', id) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) console.error('[deleteProduct]', error.message)
}

export async function deleteCategory(id: string) {
  enqueueDelete('categories', id) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) console.error('[deleteCategory]', error.message)
}

export async function deletePromo(id: string) {
  enqueueDelete('promo_codes', id) // fila local (Electron)
  if (!isSupabaseReady() || !supabase) return
  const { error } = await supabase.from('promo_codes').delete().eq('id', id)
  if (error) console.error('[deletePromo]', error.message)
}

// ── FIDELIZAÇÃO / DEVOLUÇÕES ──────────────────────────────────
// Faltavam por completo — pontos ganhos/resgatados e devoluções eram só
// gravados em localStorage e desapareciam na sincronização seguinte.

export async function syncLoyalty(transactions: any[]): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady() || !supabase || !transactions.length) return { ok: false, error: 'Supabase não configurado' }
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncLoyalty] Sem loja seleccionada — sincronização cancelada'); return { ok: false, error: 'Sem loja seleccionada' } }
  const transactionRows = transactions.map(t => ({
    id: t.id, client_id: t.client_id ?? '', client_name: t.client_name ?? '',
    points: t.points ?? 0, type: t.type, order_id: t.order_id ?? '',
    created_at: t.created_at, store_id: sid,
  }))
  const marca = await enqueueUpsert('loyalty_transactions', transactionRows) // fila local (Electron)
  const { error } = await supabase.from('loyalty_transactions').upsert(transactionRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('loyalty_transactions', transactionRows, marca)
  if (error) { console.error('[syncLoyalty]', error.message); return { ok: false, error: error.message } }
  return { ok: true }
}

export async function syncReturns(returns_: any[]): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady() || !supabase || !returns_.length) return { ok: false, error: 'Supabase não configurado' }
  const sid = getCurrentStoreId()
  if (!sid) { console.error('[syncReturns] Sem loja seleccionada — sincronização cancelada'); return { ok: false, error: 'Sem loja seleccionada' } }
  const returnRows = returns_.map(r => ({
    id: r.id, order_id: r.order_id ?? '', order_number: r.order_number,
    customer_name: r.customer_name ?? '', items: r.items ?? [],
    total: r.total ?? 0, reason: r.reason ?? '', created_at: r.created_at,
    store_id: sid,
  }))
  const marca = await enqueueUpsert('returns', returnRows) // fila local (Electron)
  const { error } = await supabase.from('returns').upsert(returnRows, { onConflict: 'id' })
  if (!error) confirmarEnvio('returns', returnRows, marca)
  if (error) { console.error('[syncReturns]', error.message); return { ok: false, error: error.message } }
  return { ok: true }
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
    'order_items', 'orders',
    'sale_items', 'sales', 'stock_entries', 'clients',
    'products', 'categories',
    'cash_flow', 'purchases', 'delivery_zones', 'promo_codes',
    'suppliers', 'returns', 'loyalty_transactions', 'shift_sessions',
    'cf_movements', 'cf_accounts', 'cf_categories',
    'profiles', 'stores',
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
