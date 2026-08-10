import { useState, useEffect, Fragment } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, DollarSign, FileText, Users, ChevronDown, ChevronRight,
  Package, Search, RotateCcw, Printer,
} from 'lucide-react'
import { supabase, isSupabaseReady } from '../lib/supabase'
import { useStore } from '../lib/storeContext'
import type { Sale, SaleItem, StockEntry } from '../types/database'
import { printPrimaveraInvoice } from '../utils/invoice'
import { getSettings } from '../lib/settings'

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' Kz'

const fmtDate = (s: string) => {
  // Suporte para "2026-05-23 14:39:38" (PRIMAVERA) e ISO "2026-05-23T..."
  return new Date(s.replace(' ', 'T')).toLocaleDateString('pt-PT')
}

const DOC_LABEL: Record<string, string> = {
  VD2: 'Venda Directa',
  VD1: 'Venda',
  FA:  'Factura',
  FR:  'Factura-Recibo',
  RC:  'Recibo',
  NC:  'Nota de Crédito',
  VNC: 'Nota de Crédito',
}

const PAGE_SIZE = 50

// ── Tipos de período ───────────────────────────────────────────────────────────

type Period = 'month' | 'lastmonth' | 'year' | 'custom'
type SubTab = 'dashboard' | 'historico' | 'stock'

function getPeriodDates(p: Period): { start: string; end: string } {
  const now = new Date()
  switch (p) {
    case 'month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
        end:   new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
      }
    case 'lastmonth': {
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1
      return {
        start: new Date(y, m, 1).toISOString().slice(0, 10),
        end:   new Date(y, m + 1, 0).toISOString().slice(0, 10),
      }
    }
    case 'year':
      return {
        start: `${now.getFullYear()}-01-01`,
        end:   `${now.getFullYear()}-12-31`,
      }
    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
        end:   new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
      }
  }
}

// ── Componente KPI Card ────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  color: 'blue' | 'indigo' | 'green' | 'orange'
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    green:  'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colors[color]}`}>
          <Icon size={16} />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function VendasTab() {
  const { store } = useStore()

  const [subTab, setSubTab]   = useState<SubTab>('dashboard')
  const [period, setPeriod]   = useState<Period>('month')

  // Datas aplicadas nas queries
  const init = getPeriodDates('month')
  const [startDate, setStartDate] = useState(init.start)
  const [endDate,   setEndDate]   = useState(init.end)
  // Datas temporárias para input custom
  const [customStart, setCustomStart] = useState(init.start)
  const [customEnd,   setCustomEnd]   = useState(init.end)

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const [dashSales,   setDashSales]   = useState<Sale[]>([])
  const [dashLoading, setDashLoading] = useState(false)

  // ── Histórico ──────────────────────────────────────────────────────────────
  const [histSales,   setHistSales]   = useState<Sale[]>([])
  const [histTotal,   setHistTotal]   = useState(0)
  const [histPage,    setHistPage]    = useState(0)
  const [histLoading, setHistLoading] = useState(false)
  const [histSearch,  setHistSearch]  = useState('')
  const [histDocType, setHistDocType] = useState('todos')
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [itemsCache,  setItemsCache]  = useState<Record<string, SaleItem[]>>({})

  // ── Stock ──────────────────────────────────────────────────────────────────
  const [stockEntries, setStockEntries] = useState<StockEntry[]>([])
  const [stockLoading, setStockLoading] = useState(false)

  // ── Fetch functions ────────────────────────────────────────────────────────

  async function fetchDashboard(start: string, end: string) {
    if (!isSupabaseReady() || !supabase || !store?.id) return
    setDashLoading(true)
    const { data } = await supabase
      .from('sales')
      .select('id, doc_type, sale_date, client_name, total, total_vat')
      .eq('store_id', store.id)
      .gte('sale_date', start)
      .lte('sale_date', end + 'T23:59:59')
      .order('sale_date', { ascending: true })
    setDashSales((data as Sale[]) ?? [])
    setDashLoading(false)
  }

  async function fetchHistory(
    start: string, end: string,
    page: number, docType: string, search: string,
  ) {
    if (!isSupabaseReady() || !supabase || !store?.id) return
    setHistLoading(true)
    let q = supabase
      .from('sales')
      .select('*', { count: 'exact' })
      .eq('store_id', store.id)
      .gte('sale_date', start)
      .lte('sale_date', end + 'T23:59:59')
      .order('sale_date', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (docType !== 'todos') q = q.eq('doc_type', docType)
    if (search.trim())       q = q.ilike('client_name', `%${search.trim()}%`)

    const { data, count } = await q
    setHistSales((data as Sale[]) ?? [])
    setHistTotal(count ?? 0)
    setHistLoading(false)
  }

  async function fetchStock() {
    if (!isSupabaseReady() || !supabase || !store?.id) return
    setStockLoading(true)
    const { data } = await supabase
      .from('stock_entries')
      .select('*')
      .eq('store_id', store.id)
      .order('entry_date', { ascending: false })
      .limit(200)
    setStockEntries((data as StockEntry[]) ?? [])
    setStockLoading(false)
  }

  async function fetchItems(saleId: string) {
    if (itemsCache[saleId] !== undefined || !supabase) return
    const { data } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId)
      .order('id')
    setItemsCache(prev => ({ ...prev, [saleId]: (data as SaleItem[]) ?? [] }))
  }

  // ── Efeitos ────────────────────────────────────────────────────────────────

  // Carrega dashboard ao montar
  useEffect(() => {
    if (store?.id) fetchDashboard(startDate, endDate)
  }, [store?.id]) // eslint-disable-line

  // Carrega sub-tab quando muda
  useEffect(() => {
    if (!store?.id) return
    if (subTab === 'historico') fetchHistory(startDate, endDate, histPage, histDocType, histSearch)
    else if (subTab === 'stock') fetchStock()
  }, [subTab, store?.id]) // eslint-disable-line

  // ── Handlers de período ────────────────────────────────────────────────────

  function applyPeriod(p: Period) {
    setPeriod(p)
    if (p === 'custom') return // aguarda o clique em "Aplicar"
    const { start, end } = getPeriodDates(p)
    setStartDate(start)
    setEndDate(end)
    setCustomStart(start)
    setCustomEnd(end)
    setHistPage(0)
    fetchDashboard(start, end)
    if (subTab === 'historico') fetchHistory(start, end, 0, histDocType, histSearch)
  }

  function applyCustom() {
    setStartDate(customStart)
    setEndDate(customEnd)
    setHistPage(0)
    fetchDashboard(customStart, customEnd)
    if (subTab === 'historico') fetchHistory(customStart, customEnd, 0, histDocType, histSearch)
  }

  // ── Dashboard: cálculos ────────────────────────────────────────────────────

  const salesOnly  = dashSales.filter(s => s.doc_type !== 'NC')
  const creditNotes = dashSales.filter(s => s.doc_type === 'NC')
  const totalVendas = salesOnly.reduce((a, s) => a + (s.total ?? 0), 0)
  const totalNC     = creditNotes.reduce((a, s) => a + (s.total ?? 0), 0)
  const totalLiq    = totalVendas - totalNC
  const nDocs       = dashSales.length
  const avgPerDoc   = salesOnly.length > 0 ? totalVendas / salesOnly.length : 0

  // Agrupamento para o gráfico: por dia (mês/lastmonth) ou por mês (ano)
  const byYear = period === 'year'
  const grouped: Record<string, number> = {}
  salesOnly.forEach(s => {
    const key = byYear ? s.sale_date.slice(0, 7) : s.sale_date.slice(0, 10)
    grouped[key] = (grouped[key] ?? 0) + (s.total ?? 0)
  })
  const chartData = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, total]) => ({
      label: byYear ? k.slice(5) : k.slice(5),  // "MM" ou "MM-DD"
      total: Math.round(total / 1000),            // em milhares de Kz
    }))

  // Top clientes
  const byClient: Record<string, number> = {}
  salesOnly.forEach(s => {
    if (!s.client_name) return
    byClient[s.client_name] = (byClient[s.client_name] ?? 0) + (s.total ?? 0)
  })
  const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Por tipo de documento
  const byType: Record<string, { count: number; total: number }> = {}
  dashSales.forEach(s => {
    if (!byType[s.doc_type]) byType[s.doc_type] = { count: 0, total: 0 }
    byType[s.doc_type].count++
    byType[s.doc_type].total += s.total ?? 0
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  const periodButtons: { key: Period; label: string }[] = [
    { key: 'month',     label: 'Este mês'    },
    { key: 'lastmonth', label: 'Mês passado' },
    { key: 'year',      label: 'Este ano'    },
    { key: 'custom',    label: 'Intervalo'   },
  ]

  // ── Trigger de sync manual ────────────────────────────────────────────────
  const [syncState, setSyncState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const triggerSync = async () => {
    setSyncState('running')
    try {
      const r = await fetch('http://localhost:5175/sync', { signal: AbortSignal.timeout(5000) })
      const d = await r.json()
      if (d.ok) {
        const poll = setInterval(async () => {
          try {
            const s = await fetch('http://localhost:5175/status', { signal: AbortSignal.timeout(3000) })
            const sd = await s.json()
            if (!sd.running) {
              clearInterval(poll)
              setSyncState('done')
              // Refresh dashboard
              if (store?.id) fetchDashboard(startDate, endDate)
              if (subTab === 'historico') fetchHistory(startDate, endDate, histPage, histDocType, histSearch)
              setTimeout(() => setSyncState('idle'), 4000)
            }
          } catch { clearInterval(poll); setSyncState('idle') }
        }, 3000)
      } else {
        setSyncState('idle')
      }
    } catch {
      setSyncState('error')
      setTimeout(() => setSyncState('idle'), 4000)
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Vendas PRIMAVERA</h3>
          <p className="text-sm text-gray-500">Dados sincronizados automaticamente do ERP</p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncState === 'running'}
          title="Sincronizar dados do PRIMAVERA agora"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            syncState === 'running' ? 'bg-indigo-100 text-indigo-600 cursor-wait' :
            syncState === 'done'    ? 'bg-green-100 text-green-700' :
            syncState === 'error'   ? 'bg-red-100 text-red-600' :
            'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
          }`}
        >
          <RotateCcw className={`w-3.5 h-3.5 ${syncState === 'running' ? 'animate-spin' : ''}`} />
          {syncState === 'running' ? 'A sincronizar…' : syncState === 'done' ? '✓ Concluído' : syncState === 'error' ? '✕ Serviço offline' : 'Sync Agora'}
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['dashboard', 'historico', 'stock'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              subTab === t
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'dashboard' ? 'Dashboard' : t === 'historico' ? 'Histórico' : 'Stock'}
          </button>
        ))}
      </div>

      {/* Selector de período (dashboard + histórico) */}
      {subTab !== 'stock' && (
        <div className="flex flex-wrap gap-2 items-center">
          {periodButtons.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => applyPeriod(key)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                period === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
              <span className="text-gray-400 text-sm">até</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
              <button
                onClick={applyCustom}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Aplicar
              </button>
            </>
          )}
        </div>
      )}

      {/* ──────────────── DASHBOARD ──────────────── */}
      {subTab === 'dashboard' && (
        <div className="space-y-5">
          {dashLoading ? (
            <div className="text-center py-16 text-gray-400">A carregar dados...</div>
          ) : dashSales.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              Nenhuma venda no período seleccionado
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Total Vendas"
                  value={fmt(totalVendas)}
                  sub={totalNC > 0 ? `NC: -${fmt(totalNC)}` : `${salesOnly.length} documentos`}
                  icon={DollarSign}
                  color="blue"
                />
                <KpiCard
                  label="Total Líquido"
                  value={fmt(totalLiq)}
                  sub="Após notas de crédito"
                  icon={TrendingUp}
                  color="green"
                />
                <KpiCard
                  label="Média por Doc."
                  value={fmt(avgPerDoc)}
                  sub={`${nDocs} documentos total`}
                  icon={FileText}
                  color="indigo"
                />
                <KpiCard
                  label="IVA cobrado"
                  value={fmt(dashSales.reduce((a, s) => a + (s.total_vat ?? 0), 0))}
                  icon={FileText}
                  color="orange"
                />
              </div>

              {/* Gráfico de barras */}
              {chartData.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    Vendas {byYear ? 'por mês' : 'por dia'} (×1 000 Kz)
                  </h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={50} />
                      <Tooltip
                        formatter={(v: unknown) => [`${Number(v ?? 0).toLocaleString('pt-PT')}K Kz`, 'Total']}
                        labelFormatter={(l: unknown) => (byYear ? `Mês ${l}` : `Dia ${l}`)}
                      />
                      <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Por tipo de documento */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Por tipo de documento</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b">
                        <th className="pb-2">Tipo</th>
                        <th className="pb-2 text-right">Docs</th>
                        <th className="pb-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(byType).map(([dt, v]) => (
                        <tr key={dt} className="border-b border-gray-50 last:border-0">
                          <td className="py-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium mr-2 ${
                              dt === 'NC'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>{dt}</span>
                            <span className="text-gray-600 text-xs">{DOC_LABEL[dt] ?? dt}</span>
                          </td>
                          <td className="py-2 text-right text-gray-600">{v.count}</td>
                          <td className="py-2 text-right font-semibold">{fmt(v.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Top clientes */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
                    <Users size={14} /> Top clientes
                  </h4>
                  {topClients.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      Sem clientes identificados (vendas sem nome de cliente)
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {topClients.map(([name, total], i) => (
                        <div key={name} className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                          <span className="text-sm text-gray-700 flex-1 truncate" title={name}>
                            {name}
                          </span>
                          <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">
                            {fmt(total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ──────────────── HISTÓRICO ──────────────── */}
      {subTab === 'historico' && (
        <div className="space-y-3">
          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Pesquisar cliente..."
                value={histSearch}
                onChange={e => {
                  setHistSearch(e.target.value)
                  setHistPage(0)
                  fetchHistory(startDate, endDate, 0, histDocType, e.target.value)
                }}
                className="border rounded-lg pl-7 pr-3 py-1.5 text-sm w-52"
              />
            </div>
            <select
              value={histDocType}
              onChange={e => {
                setHistDocType(e.target.value)
                setHistPage(0)
                fetchHistory(startDate, endDate, 0, e.target.value, histSearch)
              }}
              className="border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="todos">Todos os tipos</option>
              <option value="VD2">Venda Directa (VD2)</option>
              <option value="VD1">Venda (VD1)</option>
              <option value="FA">Factura (FA)</option>
              <option value="FR">Factura-Recibo (FR)</option>
              <option value="RC">Recibo (RC)</option>
              <option value="NC">Nota de Crédito (NC)</option>
              <option value="VNC">Nota de Crédito (VNC)</option>
            </select>
            <button
              onClick={() => fetchHistory(startDate, endDate, histPage, histDocType, histSearch)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              <RotateCcw size={13} /> Actualizar
            </button>
            <span className="text-sm text-gray-500 ml-auto">
              {histTotal.toLocaleString('pt-PT')} documentos
            </span>
          </div>

          {histLoading ? (
            <div className="text-center py-10 text-gray-400">A carregar...</div>
          ) : histSales.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              Nenhuma venda encontrada no período e filtros seleccionados
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Data</th>
                    <th className="px-3 py-2.5 text-left">Nº Doc</th>
                    <th className="px-3 py-2.5 text-left">Tipo</th>
                    <th className="px-3 py-2.5 text-left">Cliente</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5 w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {histSales.map(sale => (
                    <Fragment key={sale.id}>
                      <tr
                        className={`hover:bg-gray-50 cursor-pointer ${
                          sale.doc_type === 'NC' ? 'text-red-600' : ''
                        }`}
                        onClick={() => {
                          if (expandedId === sale.id) {
                            setExpandedId(null)
                          } else {
                            setExpandedId(sale.id)
                            fetchItems(sale.id)
                          }
                        }}
                      >
                        <td className="px-3 py-2">{fmtDate(sale.sale_date)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">
                          {sale.doc_type}/{sale.doc_number}
                          {sale.doc_series ? `/${sale.doc_series}` : ''}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            sale.doc_type === 'NC'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {sale.doc_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[180px] truncate text-gray-700">
                          {sale.client_name ?? <span className="text-gray-400 italic">Consumidor</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                          {fmt(sale.total)}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {expandedId === sale.id
                            ? <ChevronDown size={14} />
                            : <ChevronRight size={14} />}
                        </td>
                      </tr>

                      {/* Linhas do documento */}
                      {expandedId === sale.id && (
                        <tr>
                          <td colSpan={6} className="bg-gray-50 px-6 py-3">
                            {itemsCache[sale.id] === undefined ? (
                              <p className="text-xs text-gray-400 italic">A carregar linhas...</p>
                            ) : itemsCache[sale.id].length === 0 ? (
                              <p className="text-xs text-gray-400 italic">Sem linhas registadas</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead className="text-gray-400 border-b border-gray-200">
                                  <tr>
                                    <th className="text-left pb-1.5 w-20">Código</th>
                                    <th className="text-left pb-1.5">Artigo</th>
                                    <th className="text-right pb-1.5 w-16">Qtd.</th>
                                    <th className="text-right pb-1.5 w-28">P. Unit.</th>
                                    <th className="text-right pb-1.5 w-28">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {itemsCache[sale.id].map(item => (
                                    <tr key={item.id}>
                                      <td className="py-1.5 font-mono text-gray-500">
                                        {item.product_code ?? '—'}
                                      </td>
                                      <td className="py-1.5 text-gray-700">
                                        {item.description ?? '—'}
                                      </td>
                                      <td className="py-1.5 text-right">{item.quantity ?? '—'}</td>
                                      <td className="py-1.5 text-right">{fmt(item.unit_price)}</td>
                                      <td className="py-1.5 text-right font-semibold">
                                        {fmt(item.total)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-gray-200">
                                    <td colSpan={4} className="pt-1.5 text-right text-gray-500 font-medium">
                                      Total doc.
                                    </td>
                                    <td className="pt-1.5 text-right font-bold text-gray-800">
                                      {fmt(sale.total)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            )}
                            {/* Botão imprimir */}
                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={() => {
                                  const items = (itemsCache[sale.id] ?? []).map((i: SaleItem) => ({
                                    product_name: i.description ?? i.product_code ?? '—',
                                    quantity:     i.quantity   ?? 0,
                                    unit_price:   i.unit_price ?? 0,
                                    total_price:  i.total      ?? 0,
                                  }))
                                  const orderObj = {
                                    customer_name: sale.client_name ?? null,
                                    customer_nif:  sale.client_nif  ?? null,
                                    total:         Math.abs(sale.total ?? 0),
                                    created_at:    sale.sale_date,
                                    order_number:  `PRIM-${sale.primavera_id}`,
                                    items,
                                  }
                                  const saleInfo = {
                                    doc_type:   sale.doc_type,
                                    doc_number: sale.doc_number,
                                    doc_series: sale.doc_series ?? null,
                                    total_net:  sale.total_net  ?? null,
                                    total_vat:  sale.total_vat  ?? null,
                                  }
                                  printPrimaveraInvoice(orderObj, saleInfo, getSettings())
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 text-white rounded-lg text-xs font-medium hover:bg-indigo-800 transition"
                              >
                                <Printer size={13} /> Imprimir documento
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>

              {/* Paginação */}
              <div className="flex items-center justify-between px-3 py-2.5 border-t border-gray-100 bg-gray-50">
                <span className="text-xs text-gray-500">
                  Página {histPage + 1} de {Math.max(1, Math.ceil(histTotal / PAGE_SIZE))}
                  {' · '}{histTotal.toLocaleString('pt-PT')} resultados
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={histPage === 0}
                    onClick={() => {
                      const p = histPage - 1
                      setHistPage(p)
                      fetchHistory(startDate, endDate, p, histDocType, histSearch)
                    }}
                    className="px-2.5 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-white"
                  >
                    ← Anterior
                  </button>
                  <button
                    disabled={(histPage + 1) * PAGE_SIZE >= histTotal}
                    onClick={() => {
                      const p = histPage + 1
                      setHistPage(p)
                      fetchHistory(startDate, endDate, p, histDocType, histSearch)
                    }}
                    className="px-2.5 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-white"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────── STOCK ──────────────── */}
      {subTab === 'stock' && (
        <div className="space-y-3">
          {stockLoading ? (
            <div className="text-center py-10 text-gray-400">A carregar...</div>
          ) : stockEntries.length === 0 ? (
            <div className="text-center py-16">
              <Package size={36} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-500 font-medium">Sem movimentos de stock</p>
              <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
                Os movimentos surgirão aqui quando houver documentos de Entrada de Stock (ES)
                ou Saída de Stock (SS) registados no PRIMAVERA.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Movimentos de stock ({stockEntries.length})
                </span>
                <button
                  onClick={fetchStock}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  <RotateCcw size={12} /> Actualizar
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Data</th>
                    <th className="px-3 py-2.5 text-left">Artigo</th>
                    <th className="px-3 py-2.5 text-left hidden md:table-cell">Fornecedor</th>
                    <th className="px-3 py-2.5 text-left hidden md:table-cell">Tipo</th>
                    <th className="px-3 py-2.5 text-right">Qtd.</th>
                    <th className="px-3 py-2.5 text-right hidden md:table-cell">Custo Unit.</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stockEntries.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{e.product_name ?? e.product_code}</span>
                        {e.product_name && (
                          <span className="text-gray-400 text-xs ml-1 font-mono">
                            {e.product_code}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 hidden md:table-cell">
                        {e.supplier_name ?? '—'}
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        {e.doc_type && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            {e.doc_type}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{e.quantity ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600 hidden md:table-cell">
                        {fmt(e.unit_cost)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{fmt(e.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
