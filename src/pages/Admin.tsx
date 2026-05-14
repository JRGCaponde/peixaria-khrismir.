import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import CryptoJS from 'crypto-js'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  Plus, Trash2, Edit, Package, Users, TrendingUp, FileText,
  Database, Upload, Wallet, Search, Filter,
  Receipt, MessageCircle, Download, Clock, ShoppingBag,
  Settings, MapPin, Tag, UserCheck, Printer, Truck, RotateCcw,
  Star, CalendarDays, AlertTriangle, QrCode, Share2, X, DollarSign, Monitor, FileBarChart2,
  Store, CheckCircle, XCircle, Building2, Save,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { Product, Category, Order, CashFlow, Purchase, User, OrderStatus, DeliveryZone, PromoCode, Supplier, Return, LoyaltyTransaction } from '../types/database'
import { getSettings, saveSettings, type StoreSettings } from '../lib/settings'
import { printInvoice } from '../utils/invoice'
import { printDailySalesReport, printMonthlySalesReport, printPurchasesReport, printMonthlyReport, printCashFlowReport } from '../utils/reports'
import { getLastBackupMeta, restoreLocalBackup, type BackupMeta } from '../lib/autoBackup'
import { registerPurchaseMovement, getCashFlowSummary, syncAllData, migrateExistingData } from '../lib/cashflow'
import {
  syncOrderStatus, pullAll, pushAll,
  syncProducts, syncCategories, syncDeliveryZones, syncPromos, syncSettings,
  syncPurchases, syncSuppliers, clearAllData,
  deleteProduct, deleteCategory, deleteZone, deletePromo,
  syncStore, deleteStorePermanent,
} from '../lib/sync'
import { supabase, isSupabaseReady } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { generateSAFTXML, downloadSAFT } from '../utils/saft'
import { useAuthStore } from '../stores/useAuthStore'
import { subscribePresence, type OnlineUser } from '../lib/presence'

type Tab = 'overview' | 'orders' | 'products' | 'categories' | 'employees' | 'customers' | 'cashflow' | 'purchases' | 'suppliers' | 'delivery' | 'promos' | 'returns' | 'loyalty' | 'calendar' | 'agt' | 'settings' | 'system' | 'sessions' | 'reports' | 'stores'

const statusConfig: Record<OrderStatus, { label: string; color: string; next?: OrderStatus }> = {
  pendente:   { label: 'Pendente',   color: 'bg-yellow-100 text-yellow-800',  next: 'confirmado' },
  confirmado: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800',      next: 'preparando' },
  preparando: { label: 'Preparando', color: 'bg-orange-100 text-orange-800',  next: 'pronto'     },
  pronto:     { label: 'Pronto',     color: 'bg-green-100 text-green-800',    next: 'entregue'   },
  entregue:   { label: 'Entregue',   color: 'bg-emerald-100 text-emerald-800'                    },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-800'                            },
}

// Sem dados fictícios — carrega apenas do localStorage / Supabase
const initialCategories: Category[] = []
const initialProducts: Product[] = []

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const playBeep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }
    playBeep(880, 0,    0.12)
    playBeep(1100, 0.15, 0.12)
    playBeep(1320, 0.30, 0.20)
  } catch { /* silencia se o browser bloquear */ }
}

export default function Admin() {
  const { user: authUser } = useAuthStore()
  const isAdmin = authUser?.role === 'admin' || authUser?.role === 'super_admin'
  const gerenteAreas: string[] = (authUser?.role === 'gerente' && authUser?.access_areas) ? authUser.access_areas : []

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [categories, setCategories] = useState<Category[]>([])
  const [products,   setProducts]   = useState<Product[]>([])
  const [orders,     setOrders]     = useState<Order[]>([])
  const [employees,  setEmployees]  = useState<User[]>([])
  const [cashFlow,   setCashFlow]   = useState<CashFlow[]>([])
  const [purchases,  setPurchases]  = useState<Purchase[]>([])
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(getSettings())

  useEffect(() => {
    const load = (key: string, fallback: any) => {
      try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
    }

    // ── Limpeza única de compras inválidas (formato antigo / total_price = 0) ──
    try {
      const raw: any[] = JSON.parse(localStorage.getItem('khrismir_purchases') || '[]')
      const clean = raw.filter((p: any) => Number(p.total_price) > 0 && p.product_id)
      if (clean.length !== raw.length) {
        localStorage.setItem('khrismir_purchases', JSON.stringify(clean))
        console.log(`[Admin] Purge compras inválidas: ${raw.length - clean.length} removidas`)
      }
    } catch { /* non-fatal */ }

    const loadAll = () => {
      setOrders(load('khrismir_orders', []))
      setEmployees(load('khrismir_employees', []))
      setCashFlow(load('khrismir_cashflow', []))
      // Filtra compras inválidas (formato antigo com total_price=0 ou sem product_id)
      setPurchases((load('khrismir_purchases', []) as any[]).filter((p: any) => Number(p.total_price) > 0 && p.product_id))
      setProducts(load('khrismir_products', initialProducts))
      setCategories(load('khrismir_categories', initialCategories))
      syncAllData()
    }
    loadAll()

    // ── Sincronização inicial ─────────────────────────────────
    const autoSync = async () => {
      await pullAll()
      loadAll()
      if (isSupabaseReady()) {
        const alreadySynced = localStorage.getItem('khrismir_auto_synced')
        if (!alreadySynced) {
          const result = await pushAll()
          if (result.ok) {
            localStorage.setItem('khrismir_auto_synced', '1')
            toast.success('✅ Dados sincronizados com a cloud!')
          } else {
            const erros = (result.details ?? []).filter(d => typeof d === 'string' && d.startsWith('❌'))
            const msg = erros.length ? erros.join(' | ') : (result.error ?? 'Erro desconhecido')
            toast.error(`Erro na sincronização automática: ${msg}`, { duration: 10000 })
          }
        } else {
          pushAll()
        }
      }
    }
    autoSync()

    // ── Listener do Realtime global (realtime.ts) ─────────────
    // Sempre que QUALQUER tabela mudar num QUALQUER dispositivo,
    // o realtime.ts actualiza o localStorage e dispara este evento.
    const handleSync = () => loadAll()
    window.addEventListener('khrismir:sync', handleSync)

    // ── Canal de notificações de encomendas (toast + som) ─────
    // Separado do sync de dados — só para alertas visuais/sonoros
    if (!isSupabaseReady() || !supabase) {
      return () => window.removeEventListener('khrismir:sync', handleSync)
    }

    const notifiedIds = new Set<string>()
    let channelRef: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let isMounted = true

    const subscribeNotifications = () => {
      if (!isMounted) return
      if (channelRef) supabase!.removeChannel(channelRef)
      channelRef = supabase!
        .channel('admin-notifications')
        .on('broadcast', { event: 'new_order' }, ({ payload }) => {
          if (!payload?.id || notifiedIds.has(payload.id)) return
          notifiedIds.add(payload.id)
          playNotificationSound()
          toast(`🛒 Nova encomenda: ${payload.order_number}`, {
            description: `${payload.customer_name || 'Cliente'} • ${(payload.total || 0).toLocaleString()} AOA`,
            duration: 8000,
            action: { label: 'Ver', onClick: () => setActiveTab('orders') },
          })
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
          const o = payload.new as Order
          if (notifiedIds.has(o.id)) return
          notifiedIds.add(o.id)
          playNotificationSound()
          toast(`🛒 Nova encomenda: ${o.order_number}`, {
            description: `${o.customer_name || 'Cliente'} • ${(o.total || 0).toLocaleString()} AOA`,
            duration: 8000,
            action: { label: 'Ver', onClick: () => setActiveTab('orders') },
          })
          // O realtime.ts já actualizou o localStorage e disparou khrismir:sync
          // loadAll() será chamado pelo handleSync acima
        })
        .subscribe(status => {
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && isMounted) {
            reconnectTimer = setTimeout(subscribeNotifications, 3000)
          }
        })
    }

    subscribeNotifications()

    // Fallback: pull a cada 2 minutos (caso WebSocket caia)
    const interval = setInterval(() => pullAll().then(loadAll), 120000)

    return () => {
      isMounted = false
      window.removeEventListener('khrismir:sync', handleSync)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (channelRef) supabase!.removeChannel(channelRef)
      clearInterval(interval)
    }
  }, [])

  const todayTotal = orders
    .filter(o => new Date(o.created_at).toDateString() === new Date().toDateString() && o.status !== 'cancelado')
    .reduce((sum, o) => sum + o.total, 0)
  const lowStock = products.filter(p => p.stock_quantity <= p.min_stock)
  const pendingOrders = orders.filter(o => o.status === 'pendente').length

  const expiringProducts = products.filter(p => {
    if (!p.expiry_date) return false
    const days = Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / 86400000)
    return days <= 7 && days >= 0
  })

  const allTabs: { id: Tab; label: string; icon: React.ElementType; badge?: number; adminOnly?: boolean }[] = [
    { id: 'overview',   label: 'Visão Geral',   icon: TrendingUp, badge: expiringProducts.length > 0 ? expiringProducts.length : undefined },
    { id: 'orders',     label: 'Encomendas',    icon: ShoppingBag, badge: pendingOrders },
    { id: 'products',   label: 'Produtos',      icon: Package                      },
    { id: 'categories', label: 'Categorias',    icon: Filter                       },
    { id: 'employees',  label: 'Equipa',        icon: Users                        },
    { id: 'customers',  label: 'Clientes',      icon: UserCheck                    },
    { id: 'cashflow',   label: 'Financeiro',    icon: Wallet                       },
    { id: 'purchases',  label: 'Compras/Stock', icon: Receipt                      },
    { id: 'suppliers',  label: 'Fornecedores',  icon: Truck                        },
    { id: 'returns',    label: 'Devoluções',    icon: RotateCcw                    },
    { id: 'loyalty',    label: 'Fidelização',   icon: Star                         },
    { id: 'calendar',   label: 'Calendário',    icon: CalendarDays                 },
    { id: 'delivery',   label: 'Zonas Entrega', icon: MapPin                       },
    { id: 'promos',     label: 'Promoções',     icon: Tag                          },
    { id: 'agt',        label: 'AGT / Fiscal',  icon: FileText                     },
    { id: 'settings',   label: 'Configurações', icon: Settings                     },
    { id: 'system',     label: 'Sistema',       icon: Database                     },
    { id: 'reports',    label: 'Relatórios',    icon: FileBarChart2                },
    { id: 'sessions',   label: 'Sessões Online', icon: Monitor, adminOnly: true    },
    { id: 'stores',     label: 'Lojas',          icon: Store,   adminOnly: true    },
  ]

  // Filtra tabs: admin vê tudo, gerente vê só as áreas autorizadas (+ sessões excluído)
  const tabs = isAdmin
    ? allTabs
    : allTabs.filter(t => !t.adminOnly && gerenteAreas.includes(t.id))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Khrismir Admin</h2>
        <p className="text-gray-500 text-sm">Painel de administração</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition -mb-px ${
              activeTab === tab.id ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge ? (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{tab.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'overview'   && <OverviewTab orders={orders} total={todayTotal} lowStock={lowStock} products={products} />}
        {activeTab === 'orders'     && <OrdersTab orders={orders} storeSettings={storeSettings} setOrders={o => { setOrders(o); localStorage.setItem('khrismir_orders', JSON.stringify(o)) }} />}
        {activeTab === 'products'   && <ProductsTab products={products} setProducts={setProducts} categories={categories} />}
        {activeTab === 'categories' && <CategoriesTab categories={categories} setCategories={setCategories} />}
        {activeTab === 'employees'  && <EmployeesTab employees={employees} setEmployees={setEmployees} />}
        {activeTab === 'customers'  && <CustomersTab orders={orders} />}
        {activeTab === 'cashflow'   && <CashFlowTab cashFlow={cashFlow} setCashFlow={setCashFlow} />}
        {activeTab === 'purchases'  && (
          <PurchasesTab products={products} setProducts={setProducts} purchases={purchases} setPurchases={setPurchases} />
        )}
        {activeTab === 'suppliers'  && <SuppliersTab />}
        {activeTab === 'returns'    && <ReturnsTab orders={orders} products={products} setProducts={setProducts} setOrders={o => { setOrders(o); localStorage.setItem('khrismir_orders', JSON.stringify(o)) }} />}
        {activeTab === 'loyalty'    && <LoyaltyTab orders={orders} />}
        {activeTab === 'calendar'   && <CalendarTab orders={orders} />}
        {activeTab === 'delivery'   && <DeliveryTab />}
        {activeTab === 'promos'     && <PromosTab />}
        {activeTab === 'agt'        && <AGTTab orders={orders} storeSettings={storeSettings} purchases={purchases} />}
        {activeTab === 'settings'   && <SettingsTab settings={storeSettings} onSave={s => { setStoreSettings(s); saveSettings(s); syncSettings(s) }} />}
        {activeTab === 'system'     && <SystemTab products={products} categories={categories} />}
        {activeTab === 'reports'    && <ReportsTab orders={orders} purchases={purchases} storeSettings={storeSettings} />}
        {activeTab === 'sessions'   && <SessionsTab />}
        {activeTab === 'stores'     && <StoresTab />}
      </div>
    </div>
  )
}

/* ─── VISÃO GERAL ─── */
const CHART_COLORS = ['#06b6d4', '#3b82f6', '#10b981']

function OverviewTab({ orders, total, lowStock, products }: { orders: Order[]; total: number; lowStock: Product[]; products: Product[] }) {
  const [cfSummary, setCfSummary] = useState(() => getCashFlowSummary())
  useEffect(() => { syncAllData(); setCfSummary(getCashFlowSummary()) }, [])

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = d.toDateString()
    const day = orders.filter(o => new Date(o.created_at).toDateString() === ds && o.status !== 'cancelado')
    return { dia: d.toLocaleDateString('pt-AO', { weekday: 'short', day: 'numeric' }), total: day.reduce((s, o) => s + o.total, 0), pedidos: day.length }
  })
  const byPayment = ['multicaixa', 'express', 'dinheiro'].map(t => ({ name: t.charAt(0).toUpperCase() + t.slice(1), value: orders.filter(o => o.payment_type === t && o.status !== 'cancelado').length })).filter(p => p.value > 0)
  const monthTotal = cfSummary.monthIncome
  const monthProfit = cfSummary.monthIncome - cfSummary.monthExpense
  const expiringProducts = products.filter(p => {
    if (!p.expiry_date) return false
    const days = Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / 86400000)
    return days <= 7 && days >= 0
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-5 rounded-2xl text-white shadow-lg">
          <p className="opacity-80 text-xs font-medium uppercase">Vendas Hoje</p>
          <h3 className="text-2xl font-black mt-1">{total.toLocaleString()} Kz</h3>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-cyan-600 p-5 rounded-2xl text-white shadow-lg">
          <p className="opacity-80 text-xs font-medium uppercase">Vendas Mês</p>
          <h3 className="text-2xl font-black mt-1">{monthTotal.toLocaleString()} Kz</h3>
        </div>
        <div className={`p-5 rounded-2xl shadow-lg text-white ${monthProfit >= 0 ? 'bg-gradient-to-br from-purple-500 to-violet-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
          <p className="opacity-80 text-xs font-medium uppercase">Lucro Mês</p>
          <h3 className="text-2xl font-black mt-1">{monthProfit >= 0 ? '+' : ''}{monthProfit.toLocaleString()} Kz</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-gray-400 text-xs font-medium uppercase">Alertas Stock</p>
          <h3 className={`text-2xl font-black mt-1 ${lowStock.length > 0 ? 'text-red-500' : 'text-gray-800'}`}>{lowStock.length} itens</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <h3 className="font-bold mb-4 text-gray-700">Vendas – Últimos 7 Dias</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={last7}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} Kz`, 'Total']} />
              <Bar dataKey="total" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <h3 className="font-bold mb-4 text-gray-700">Pedidos por Pagamento</h3>
          {byPayment.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byPayment} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                  label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {byPayment.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-gray-400 py-16 text-sm">Sem dados ainda</p>}
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
          <h4 className="text-red-800 font-bold mb-3 flex items-center gap-2"><Package className="w-5 h-5" /> Reposição Necessária</h4>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(p => (
              <span key={p.id} className="bg-white border border-red-200 px-3 py-1 rounded-full text-xs font-semibold text-red-600">
                {p.name}: {p.stock_quantity} {p.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      {expiringProducts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <h4 className="text-amber-800 font-bold mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Produtos a Expirar em 7 Dias</h4>
          <div className="flex flex-wrap gap-2">
            {expiringProducts.map(p => {
              const days = Math.ceil((new Date(p.expiry_date!).getTime() - Date.now()) / 86400000)
              return (
                <span key={p.id} className="bg-white border border-amber-200 px-3 py-1 rounded-full text-xs font-semibold text-amber-700">
                  {p.name}: {days === 0 ? 'hoje!' : `${days}d`}
                </span>
              )
            })}
          </div>
        </div>
      )}

      <AppQRCard />
    </div>
  )
}

/* ─── CARTÃO QR CODE (partilha com clientes) ─── */
const APP_URL = 'https://peixaria-khrismir.vercel.app'

function AppQRCard() {
  const [showModal, setShowModal] = useState(false)

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=500,height=620')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8"/>
  <title>QR Code — Peixaria Khrismir</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box }
    body { font-family: Arial, sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f0f9ff }
    .card { background:white; border-radius:20px; padding:40px 36px; text-align:center; box-shadow:0 4px 24px rgba(0,0,0,.12); max-width:380px; width:100% }
    .logo { font-size:26px; font-weight:900; color:#0891b2; margin-bottom:4px }
    .sub  { font-size:13px; color:#64748b; margin-bottom:24px }
    svg   { display:block; margin:0 auto 20px }
    .cta  { font-size:15px; font-weight:700; color:#0f172a; margin-bottom:8px }
    .url  { font-size:12px; color:#0891b2; word-break:break-all; background:#f0f9ff; padding:8px 12px; border-radius:8px; font-family:monospace }
    .steps { margin-top:20px; text-align:left; font-size:12px; color:#64748b; line-height:1.8 }
    .steps strong { color:#0f172a }
    @media print { body { background:white } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🐟 Peixaria Khrismir</div>
    <div class="sub">Lubango · Huíla · Angola</div>
    <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
      ${win.document.getElementById('qr-svg-content')?.innerHTML || ''}
    </svg>
    <div class="cta">Aceda à nossa loja online</div>
    <div class="url">${APP_URL}</div>
    <div class="steps">
      <strong>Como usar:</strong><br/>
      📱 Android — abrir o Chrome e apontar a câmara<br/>
      🍎 iPhone — abrir a Câmara e tocar na notificação<br/>
      💻 Mac — abrir o link no browser
    </div>
  </div>
  <script>
    // Copiar o SVG gerado pelo React
    const placeholder = document.querySelector('svg');
    const source = window.opener?.document.getElementById('admin-qr-svg');
    if (source && placeholder) placeholder.outerHTML = source.outerHTML;
    setTimeout(() => window.print(), 400);
  </script>
</body>
</html>`)
    win.document.close()
  }

  return (
    <>
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl p-6 text-white flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2"><QrCode className="w-5 h-5" /> Partilhar App com Clientes</h3>
          <p className="text-cyan-100 text-sm mt-1">Os clientes fazem encomendas directamente pelo telemóvel ou computador.</p>
          <p className="mt-2 font-mono text-xs bg-white/20 px-3 py-1.5 rounded-lg inline-block">{APP_URL}</p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-white text-cyan-700 px-5 py-2.5 rounded-xl font-bold hover:bg-cyan-50 transition text-sm">
            <QrCode className="w-4 h-4" /> Ver QR Code
          </button>
          <button onClick={() => { navigator.clipboard?.writeText(APP_URL); toast.success('Link copiado!') }}
            className="flex items-center gap-2 bg-white/20 text-white border border-white/30 px-5 py-2.5 rounded-xl font-bold hover:bg-white/30 transition text-sm">
            <Share2 className="w-4 h-4" /> Copiar Link
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-center p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl text-gray-800">QR Code da Loja</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>

            <div id="admin-qr-svg" className="flex justify-center mb-4 bg-white p-4 rounded-xl border-4 border-cyan-100">
              <QRCodeSVG
                id="admin-qr-svg"
                value={APP_URL}
                size={220}
                level="H"
                includeMargin={false}
                imageSettings={{
                  src: '/icon.svg',
                  x: undefined,
                  y: undefined,
                  height: 40,
                  width: 40,
                  excavate: true,
                }}
              />
            </div>

            <p className="text-sm font-bold text-gray-800 mb-1">Peixaria Khrismir</p>
            <p className="text-xs text-cyan-600 font-mono mb-6">{APP_URL}</p>

            <div className="text-left bg-gray-50 rounded-xl p-4 mb-6 text-xs text-gray-600 space-y-1">
              <p>📱 <strong>Android:</strong> Chrome → apontar câmara ao QR</p>
              <p>🍎 <strong>iPhone:</strong> Câmara → tocar na notificação</p>
              <p>💻 <strong>Mac:</strong> Abrir o link no browser</p>
              <p className="pt-1 text-gray-400">Depois: "Adicionar ao ecrã inicial" para instalar como app</p>
            </div>

            <div className="flex gap-3">
              <button onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-2 bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition text-sm">
                <Printer className="w-4 h-4" /> Imprimir
              </button>
              <button onClick={() => { navigator.clipboard?.writeText(APP_URL); toast.success('Link copiado!') }}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition text-sm">
                <Share2 className="w-4 h-4" /> Copiar Link
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ─── ENCOMENDAS ─── */
function OrdersTab({ orders, setOrders, storeSettings }: { orders: Order[]; setOrders: (o: Order[]) => void; storeSettings: StoreSettings }) {
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const filtered = orders.filter(o => {
    const ms = filter === 'all' || o.status === filter
    const mq = !search || o.order_number.toLowerCase().includes(search.toLowerCase()) || (o.customer_name || '').toLowerCase().includes(search.toLowerCase())
    return ms && mq
  })

  const updateStatus = (id: string, status: OrderStatus) => {
    setOrders(orders.map(o => o.id === id ? { ...o, status, updated_at: new Date().toISOString() } : o))
    syncOrderStatus(id, status)
    toast.success(`Estado: ${statusConfig[status].label}`)
  }

  const cancelOrder = (id: string) => {
    if (!confirm('Cancelar esta encomenda?')) return
    updateStatus(id, 'cancelado')
  }

  const whatsApp = (order: Order) => {
    const msg = `Olá! A sua encomenda *${order.order_number}* está ${statusConfig[order.status].label}. Total: ${order.total.toLocaleString()} AOA. Obrigado! 🐟`
    return `https://wa.me/${storeSettings.whatsapp}?text=${encodeURIComponent(msg)}`
  }

  const pending = orders.filter(o => o.status === 'pendente').length

  return (
    <div className="space-y-4">
      {pending > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-yellow-600 shrink-0" />
          <p className="text-yellow-800 font-medium">{pending} encomenda(s) aguardam confirmação</p>
        </div>
      )}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número ou cliente..."
              className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', ...Object.keys(statusConfig)] as const).map(s => (
              <button key={s} onClick={() => setFilter(s as any)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${filter === s ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s === 'all' ? 'Todos' : statusConfig[s as OrderStatus].label}
                {s === 'pendente' && pending > 0 && <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1">{pending}</span>}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? <p className="text-center text-gray-500 py-8">Nenhuma encomenda encontrada</p> : (
          <div className="space-y-4">
            {filtered.map(order => (
              <div key={order.id} className="border border-gray-100 rounded-2xl p-4 hover:shadow-md transition">
                <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
                  <div>
                    <h4 className="font-bold text-lg">{order.order_number}</h4>
                    <p className="text-sm text-gray-500">{order.customer_name || 'Venda POS'} • {new Date(order.created_at).toLocaleString('pt-AO')}</p>
                    <p className="text-xs text-gray-400 capitalize">{order.delivery_type === 'delivery' ? '🚚 Entrega' : '🏪 Retirada'} • {order.payment_type}</p>
                    {order.delivery_address && <p className="text-xs text-gray-400">📍 {order.delivery_address}</p>}
                    {order.discount_code && <p className="text-xs text-green-600">🏷️ Desconto: {order.discount_code} (-{(order.discount_amount || 0).toLocaleString()} Kz)</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusConfig[order.status].color}`}>{statusConfig[order.status].label}</span>
                    <span className="font-bold text-cyan-600">{order.total.toLocaleString()} AOA</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 mb-3 text-sm space-y-1">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{item.product_name} ({item.preparation}) × {Number(item.quantity).toFixed(2)}</span>
                      <span className="font-medium">{Number(item.total_price).toLocaleString()} AOA</span>
                    </div>
                  ))}
                  {(order.delivery_fee ?? 0) > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Taxa de entrega ({order.delivery_zone})</span>
                      <span>{(order.delivery_fee || 0).toLocaleString()} AOA</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {statusConfig[order.status].next && (
                    <button onClick={() => updateStatus(order.id, statusConfig[order.status].next!)}
                      className="flex-1 bg-cyan-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-cyan-700 transition">
                      → {statusConfig[statusConfig[order.status].next!].label}
                    </button>
                  )}
                  {order.status !== 'cancelado' && order.status !== 'entregue' && (
                    <button onClick={() => cancelOrder(order.id)}
                      className="px-4 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition">
                      Cancelar
                    </button>
                  )}
                  <button onClick={() => printInvoice(order, storeSettings)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition">
                    <Printer className="w-4 h-4" /> Fatura
                  </button>
                  <a href={whatsApp(order)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition">
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── PRODUTOS ─── */
function ProductsTab({ products, setProducts, categories }: { products: Product[]; setProducts: (p: Product[]) => void; categories: Category[] }) {
  const [modal, setModal]               = useState<'new' | 'edit' | null>(null)
  const [editing, setEditing]           = useState<Product | null>(null)
  const [form, setForm]                 = useState<Partial<Product>>({ name: '', price: 0, category_id: '', unit: 'kg', min_stock: 5, allow_whole: true, allow_clean: false, allow_fillet: false, allow_steak: false, image_url: '' })
  const [qrProduct, setQrProduct]       = useState<Product | null>(null)
  const [discountProduct, setDiscountProduct] = useState<Product | null>(null)
  const [discountVal, setDiscountVal]   = useState('')
  const [priceProduct, setPriceProduct] = useState<Product | null>(null)
  const [priceVal, setPriceVal]         = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const openNew  = () => { setForm({ name: '', price: 0, category_id: '', unit: 'kg', min_stock: 5, allow_whole: true, allow_clean: false, allow_fillet: false, allow_steak: false, image_url: '' }); setEditing(null); setModal('new') }
  const openEdit = (p: Product) => { setForm({ ...p }); setEditing(p); setModal('edit') }
  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setForm(f => ({ ...f, image_url: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    let updated: Product[]
    if (modal === 'edit' && editing) {
      updated = products.map(p => p.id === editing.id ? { ...p, ...form } as Product : p)
      toast.success('Produto atualizado!')
    } else {
      updated = [...products, { ...form, id: Date.now().toString(), stock_quantity: 0 } as Product]
      toast.success('Produto criado!')
    }
    setProducts(updated)
    localStorage.setItem('khrismir_products', JSON.stringify(updated))
    syncProducts(updated)
    setModal(null)
  }
  const del = (id: string) => {
    if (!confirm('Eliminar produto?')) return
    const updated = products.filter(p => p.id !== id)
    setProducts(updated); localStorage.setItem('khrismir_products', JSON.stringify(updated))
    deleteProduct(id)
    toast.success('Produto eliminado')
  }

  const saveDiscount = () => {
    const pct = Math.min(100, Math.max(0, Number(discountVal)))
    const updated = products.map(p => p.id === discountProduct!.id ? { ...p, discount: pct } : p)
    setProducts(updated); localStorage.setItem('khrismir_products', JSON.stringify(updated)); syncProducts(updated)
    setDiscountProduct(null)
    toast.success(pct > 0 ? `Desconto de ${pct}% aplicado!` : 'Desconto removido')
  }

  const savePrice = () => {
    const newPrice = Math.max(0, Number(priceVal))
    if (!newPrice) { toast.error('Preço inválido'); return }
    const updated = products.map(p => p.id === priceProduct!.id ? { ...p, price: newPrice } : p)
    setProducts(updated); localStorage.setItem('khrismir_products', JSON.stringify(updated)); syncProducts(updated)
    setPriceProduct(null)
    toast.success('Preço atualizado!')
  }

  const printQr = (p: Product) => {
    const win = window.open('', '_blank', 'width=400,height=500')
    if (!win) return
    win.document.write(`<html><body style="text-align:center;font-family:sans-serif;padding:20px">
      <h2>${p.name}</h2>
      <div id="qr"></div>
      <p style="font-size:11px;color:#666">ID: ${p.id}</p>
      <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
      <script>QRCode.toCanvas(document.createElement('canvas'),'product:${p.id}',function(e,c){if(!e){document.getElementById('qr').appendChild(c)}});setTimeout(()=>window.print(),800)</script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-xl font-bold">Inventário</h2>
        <button onClick={openNew} className="bg-cyan-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium hover:bg-cyan-700 transition">
          <Plus className="w-4 h-4" /> Novo Produto
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="text-gray-400 text-sm border-b">
            <th className="pb-4">Produto</th><th className="pb-4">Preço (AOA/kg)</th><th className="pb-4">Stock</th><th className="pb-4 text-right">Acções</th>
          </tr></thead>
          <tbody className="divide-y">
            {products.map(p => {
              const discountedPrice = p.discount ? Math.round(p.price * (1 - p.discount / 100)) : null
              return (
                <tr key={p.id} className="group">
                  <td className="py-3 flex items-center gap-3">
                    {p.image_url ? <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center text-xl">🐟</div>}
                    <span className="font-semibold">{p.name}</span>
                  </td>
                  <td className="py-3">
                    <div>
                      <span className={discountedPrice ? 'line-through text-gray-400 text-sm' : 'font-medium'}>{Number(p.price).toLocaleString()}</span>
                      {discountedPrice && (
                        <span className="ml-2 font-bold text-green-600">{discountedPrice.toLocaleString()} <span className="text-xs bg-green-100 text-green-700 px-1 rounded">-{p.discount}%</span></span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${p.stock_quantity <= p.min_stock ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {p.stock_quantity} {p.unit}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setQrProduct(p)} title="QR Code" className="text-gray-400 hover:text-purple-600 p-2 transition"><QrCode className="w-4 h-4" /></button>
                      <button onClick={() => { setDiscountProduct(p); setDiscountVal(String(p.discount ?? 0)) }} title="Desconto" className="text-gray-400 hover:text-orange-500 p-2 transition"><Tag className="w-4 h-4" /></button>
                      <button onClick={() => { setPriceProduct(p); setPriceVal(String(p.price)) }} title="Editar Preço" className="text-gray-400 hover:text-green-600 p-2 transition"><DollarSign className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(p)} title="Editar" className="text-gray-400 hover:text-cyan-600 p-2 transition"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => del(p.id)} title="Eliminar" className="text-gray-400 hover:text-red-600 p-2 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal Editar/Criar ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-6">{modal === 'edit' ? 'Editar Produto' : 'Novo Produto'}</h3>
            <div className="space-y-4">
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-cyan-400 hover:bg-cyan-50 transition">
                {form.image_url ? <img src={form.image_url} alt="preview" className="w-24 h-24 object-cover rounded-lg mx-auto" /> : (
                  <div className="text-gray-400 text-sm"><Upload className="w-8 h-8 mx-auto mb-1 opacity-50" />Clique para escolher imagem</div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
              <input type="text" placeholder="Nome do Produto" required value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border p-3 rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Preço de Venda (AOA/kg)" required min="0" value={form.price || ''} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} className="w-full border p-3 rounded-xl" />
                <input type="number" placeholder="Preço de Custo (AOA/kg)" min="0" value={form.cost_price || ''} onChange={e => setForm(f => ({ ...f, cost_price: Number(e.target.value) }))} className="w-full border p-3 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Stock Mín." min="0" value={form.min_stock || ''} onChange={e => setForm(f => ({ ...f, min_stock: Number(e.target.value) }))} className="w-full border p-3 rounded-xl" />
                <select value={form.unit || 'kg'} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full border p-3 rounded-xl">
                  <option value="kg">kg</option><option value="un">unidade</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Data de Validade (opcional)</label>
                <input type="date" value={form.expiry_date || ''} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} className="w-full border p-3 rounded-xl" />
              </div>
              <select required value={form.category_id || ''} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="w-full border p-3 rounded-xl">
                <option value="">Selecione Categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div>
                <p className="text-sm font-medium mb-2">Tipos de Preparo</p>
                <div className="grid grid-cols-2 gap-2">
                  {[{ key: 'allow_whole', label: 'Inteiro' }, { key: 'allow_clean', label: 'Limpo' }, { key: 'allow_fillet', label: 'Filé' }, { key: 'allow_steak', label: 'Posta' }].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 p-2 border rounded-xl cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={!!(form as any)[opt.key]} onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))} />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition">{modal === 'edit' ? 'Guardar' : 'Criar'}</button>
              <button type="button" onClick={() => setModal(null)} className="w-full text-gray-400 text-sm hover:text-gray-600">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal QR Code ── */}
      {qrProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <h3 className="font-bold text-lg mb-1">{qrProduct.name}</h3>
            <p className="text-sm text-gray-500 mb-5">{Number(qrProduct.price).toLocaleString()} AOA/{qrProduct.unit}</p>
            <div className="flex justify-center mb-4">
              <QRCodeSVG value={`product:${qrProduct.id}`} size={200} level="M" />
            </div>
            <p className="text-xs text-gray-400 font-mono break-all mb-6">product:{qrProduct.id}</p>
            <div className="flex gap-2">
              <button onClick={() => printQr(qrProduct)} className="flex-1 bg-gray-800 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-gray-900 transition flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> Imprimir
              </button>
              <button onClick={() => setQrProduct(null)} className="flex-1 bg-gray-100 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Desconto ── */}
      {discountProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-lg mb-1 flex items-center gap-2"><Tag className="w-5 h-5 text-orange-500" /> Desconto</h3>
            <p className="text-sm text-gray-500 mb-1">{discountProduct.name}</p>
            <p className="text-sm text-gray-700 mb-4">Preço base: <strong>{Number(discountProduct.price).toLocaleString()} AOA/{discountProduct.unit}</strong></p>
            <div className="relative mb-3">
              <input type="number" min="0" max="100" value={discountVal} onChange={e => setDiscountVal(e.target.value)}
                placeholder="0" className="w-full border-2 border-orange-200 focus:border-orange-400 p-3 rounded-xl text-2xl font-bold text-center pr-12" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-orange-400">%</span>
            </div>
            {Number(discountVal) > 0 && Number(discountVal) <= 100 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-center">
                <p className="text-xs text-green-600">Preço com desconto</p>
                <p className="text-xl font-black text-green-700">{Math.round(discountProduct.price * (1 - Number(discountVal)/100)).toLocaleString()} AOA/{discountProduct.unit}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={saveDiscount} className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl font-bold hover:bg-orange-600 transition">Aplicar</button>
              <button onClick={() => setDiscountProduct(null)} className="flex-1 bg-gray-100 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Cancelar</button>
            </div>
            {discountProduct.discount ? (
              <button onClick={() => { setDiscountVal('0'); saveDiscount() }} className="w-full mt-2 text-xs text-red-400 hover:text-red-600">Remover desconto actual ({discountProduct.discount}%)</button>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Modal Editar Preço ── */}
      {priceProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-lg mb-1 flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-600" /> Editar Preço</h3>
            <p className="text-sm text-gray-500 mb-4">{priceProduct.name} — actual: <strong>{Number(priceProduct.price).toLocaleString()} AOA/{priceProduct.unit}</strong></p>
            <input type="number" min="0" value={priceVal} onChange={e => setPriceVal(e.target.value)}
              placeholder="Novo preço (AOA)" className="w-full border-2 border-green-200 focus:border-green-400 p-3 rounded-xl text-xl font-bold text-center mb-4" />
            <div className="flex gap-2">
              <button onClick={savePrice} className="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-bold hover:bg-green-700 transition">Guardar</button>
              <button onClick={() => setPriceProduct(null)} className="flex-1 bg-gray-100 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── CATEGORIAS ─── */
function CategoriesTab({ categories, setCategories }: { categories: Category[]; setCategories: (c: Category[]) => void }) {
  const [name, setName] = useState('')
  const add = () => {
    if (!name.trim()) return
    const updated = [...categories, { id: Date.now().toString(), name: name.trim() }]
    setCategories(updated); localStorage.setItem('khrismir_categories', JSON.stringify(updated))
    syncCategories(updated)
    setName(''); toast.success('Categoria adicionada')
  }
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm max-w-md">
      <h2 className="text-xl font-bold mb-6">Categorias</h2>
      <div className="flex gap-2 mb-6">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Congelados"
          onKeyDown={e => e.key === 'Enter' && add()} className="flex-1 border p-2 rounded-xl" />
        <button onClick={add} className="bg-cyan-600 text-white px-4 rounded-xl font-bold hover:bg-cyan-700">+</button>
      </div>
      <div className="space-y-2">
        {categories.map(c => (
          <div key={c.id} className="flex justify-between p-3 bg-gray-50 rounded-xl font-medium text-gray-700">
            {c.name}
            <button onClick={() => { const u = categories.filter(x => x.id !== c.id); setCategories(u); localStorage.setItem('khrismir_categories', JSON.stringify(u)); syncCategories(u); deleteCategory(c.id) }} className="text-red-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── EQUIPA ─── */
const GERENTE_TABS: { id: string; label: string }[] = [
  { id: 'overview',   label: 'Visão Geral'   },
  { id: 'orders',     label: 'Encomendas'    },
  { id: 'products',   label: 'Produtos'      },
  { id: 'categories', label: 'Categorias'    },
  { id: 'customers',  label: 'Clientes'      },
  { id: 'cashflow',   label: 'Financeiro'    },
  { id: 'purchases',  label: 'Compras/Stock' },
  { id: 'suppliers',  label: 'Fornecedores'  },
  { id: 'returns',    label: 'Devoluções'    },
  { id: 'loyalty',    label: 'Fidelização'   },
  { id: 'calendar',   label: 'Calendário'    },
  { id: 'delivery',   label: 'Zonas Entrega' },
  { id: 'promos',     label: 'Promoções'     },
  { id: 'agt',        label: 'AGT / Fiscal'  },
  { id: 'settings',   label: 'Configurações' },
]

function EmployeesTab({ employees, setEmployees }: { employees: User[]; setEmployees: (e: User[]) => void }) {
  const { createUser } = useAuthStore()
  const [isOpen, setIsOpen]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState({ name: '', email: '', phone: '', password: '', role: 'employee' as 'employee' | 'admin' | 'gerente' })
  const [accessAreas, setAccessAreas] = useState<string[]>([])

  const toggleArea = (id: string) => setAccessAreas(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const result = await createUser(form.email, form.password, form.name, form.phone, form.role, form.role === 'gerente' ? accessAreas : undefined)
    if (result.ok) {
      const updated: User[] = JSON.parse(localStorage.getItem('khrismir_employees') || '[]')
      setEmployees(updated)
      setIsOpen(false)
      setForm({ name: '', email: '', phone: '', password: '', role: 'employee' })
      setAccessAreas([])
      toast.success(result.supabaseId ? '✅ Funcionário criado no Supabase!' : '✅ Acesso local criado!')
    } else {
      toast.error(result.error ?? 'Erro ao criar funcionário')
    }
    setSaving(false)
  }

  const remove = (id: string) => {
    const upEmp = employees.filter(x => x.id !== id)
    setEmployees(upEmp)
    localStorage.setItem('khrismir_employees', JSON.stringify(upEmp))
    const all = JSON.parse(localStorage.getItem('khrismir_clients') || '[]').filter((u: any) => u.id !== id)
    localStorage.setItem('khrismir_clients', JSON.stringify(all))
    toast.success('Funcionário removido')
  }

  const roleLabel: Record<string, string> = { admin: 'Administrador', employee: 'Funcionário', gerente: 'Gerente' }
  const roleColor: Record<string, string> = { admin: 'bg-red-100 text-red-700', employee: 'bg-blue-100 text-blue-700', gerente: 'bg-purple-100 text-purple-700' }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between mb-8">
        <h2 className="text-xl font-bold">Equipa de Trabalho</h2>
        <button onClick={() => setIsOpen(true)} className="bg-gray-800 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm hover:bg-gray-900 transition">
          <Plus className="w-4 h-4" /> Novo Membro
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {employees.map(emp => (
          <div key={emp.id} className="border p-4 rounded-2xl flex justify-between items-start bg-gray-50/50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-gray-800">{emp.full_name}</p>
                {(emp as any).supabase_synced && (
                  <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-medium">☁ Cloud</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${roleColor[emp.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {roleLabel[emp.role] ?? emp.role}
                </span>
              </div>
              {emp.email && <p className="text-xs text-gray-400 mt-0.5">{emp.email}</p>}
              {emp.role === 'gerente' && emp.access_areas && emp.access_areas.length > 0 && (
                <p className="text-xs text-purple-500 mt-1">Acesso: {emp.access_areas.map(a => GERENTE_TABS.find(t => t.id === a)?.label ?? a).join(', ')}</p>
              )}
            </div>
            <button onClick={() => remove(emp.id)} className="text-red-400 hover:text-red-600 ml-2 mt-0.5">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={add} className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl my-4">
            <h3 className="text-xl font-bold mb-2">Criar Conta de Acesso</h3>
            <p className="text-xs text-gray-400 mb-6">Conta criada localmente e no Supabase (quando disponível)</p>
            <div className="space-y-4">
              <input type="text" placeholder="Nome Completo" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border p-3 rounded-xl" />
              <input type="email" placeholder="Email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border p-3 rounded-xl" />
              <input type="tel" placeholder="Telefone (opcional)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full border p-3 rounded-xl" />
              <input type="password" placeholder="Senha (mín. 6 caracteres)" required minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full border p-3 rounded-xl" />
              <select value={form.role} onChange={e => { setForm({ ...form, role: e.target.value as any }); setAccessAreas([]) }} className="w-full border p-3 rounded-xl">
                <option value="employee">Funcionário (POS)</option>
                <option value="gerente">Gerente (Acesso Controlado ao Admin)</option>
                <option value="admin">Administrador (Acesso Total)</option>
              </select>

              {/* Checkboxes de abas para gerente */}
              {form.role === 'gerente' && (
                <div className="border rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-purple-700 mb-2">Áreas de acesso do Gerente:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {GERENTE_TABS.map(t => (
                      <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input type="checkbox" checked={accessAreas.includes(t.id)} onChange={() => toggleArea(t.id)}
                          className="accent-purple-600 w-3.5 h-3.5" />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" disabled={saving} className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition disabled:opacity-60">
                {saving ? 'A criar...' : 'Criar'}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="w-full text-gray-400 text-sm mt-2 hover:text-gray-600">Fechar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/* ─── CLIENTES ─── */
function CustomersTab({ orders }: { orders: Order[] }) {
  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<any | null>(null)
  const [newPassModal, setNewPassModal] = useState<any | null>(null)
  const [newPass, setNewPass] = useState('')
  const [clients, setClients] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('khrismir_clients') || '[]').filter((c: any) => c.role === 'client') }
    catch { return [] }
  })

  useEffect(() => {
    if (!isSupabaseReady() || !supabase) return

    // Carrega todos os clientes do Supabase
    supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        const local: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_clients') || '[]') } catch { return [] } })()
        const supabaseIds = new Set(data.map((p: any) => p.id))
        const localOnly = local.filter((c: any) => !supabaseIds.has(c.id) && c.role === 'client')
        const merged = [...data, ...localOnly]
        setClients(merged)
        localStorage.setItem('khrismir_clients', JSON.stringify([...local.filter((c: any) => c.role !== 'client'), ...merged]))
      })

    // Realtime: notifica quando um novo cliente se regista
    const channel = supabase
      .channel('profiles-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles', filter: 'role=eq.client' }, payload => {
        setClients(prev => {
          if (prev.some(c => c.id === (payload.new as any).id)) return prev
          return [payload.new as any, ...prev]
        })
        toast(`👤 Novo cliente: ${(payload.new as any).full_name}`, { duration: 5000 })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = clients.filter((c: any) =>
    !search || c.full_name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase())
  )

  const clientOrders = (id: string) => orders.filter(o => o.customer_id === id)

  const resetPass = () => {
    if (!newPass || newPass.length < 6) { toast.error('Mínimo 6 caracteres'); return }
    const all: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]')
    const idx = all.findIndex((c: any) => c.id === newPassModal.id)
    if (idx === -1) { toast.error('Utilizador não encontrado'); return }
    all[idx].password = CryptoJS.SHA256(newPass).toString()
    localStorage.setItem('khrismir_clients', JSON.stringify(all))
    toast.success('Senha redefinida com sucesso!')
    setNewPassModal(null); setNewPass('')
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Clientes Registados</h2>
          <span className="text-sm text-gray-500">{filtered.length} clientes</span>
        </div>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..."
            className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm" />
        </div>
        <div className="space-y-3">
          {filtered.map((c: any) => {
            const ords = clientOrders(c.id).filter((o: any) => o.status !== 'cancelado')
            const total = ords.reduce((s: number, o: any) => s + o.total, 0)
            return (
              <div key={c.id} className="border border-gray-100 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <p className="font-bold">{c.full_name}</p>
                  <p className="text-sm text-gray-500">{c.email}</p>
                  {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-cyan-600">{ords.length} pedidos</p>
                  <p className="text-xs text-gray-500">Total: {total.toLocaleString()} Kz</p>
                  <p className="text-xs text-gray-400">{c.created_at ? new Date(c.created_at).toLocaleDateString('pt-AO') : '-'}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedClient(c)} className="text-xs bg-cyan-50 text-cyan-700 px-3 py-1.5 rounded-lg hover:bg-cyan-100 font-medium">Histórico</button>
                  <button onClick={() => setNewPassModal(c)} className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium">Resetar Senha</button>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="text-center text-gray-400 py-8">Nenhum cliente encontrado</p>}
        </div>
      </div>

      {selectedClient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold">{selectedClient.full_name}</h3>
                <p className="text-sm text-gray-500">{selectedClient.email}</p>
              </div>
              <button onClick={() => setSelectedClient(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <h4 className="font-bold mb-3 text-gray-700">Histórico de Pedidos</h4>
            {clientOrders(selectedClient.id).length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Sem pedidos</p>
            ) : (
              <div className="space-y-2">
                {clientOrders(selectedClient.id).map((o: any) => (
                  <div key={o.id} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex justify-between">
                      <span className="font-bold text-sm">{o.order_number}</span>
                      <span className="font-bold text-cyan-600 text-sm">{o.total.toLocaleString()} Kz</span>
                    </div>
                    <p className="text-xs text-gray-500">{new Date(o.created_at).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} • {statusConfig[o.status as OrderStatus]?.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {newPassModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Redefinir Senha — {newPassModal.full_name}</h3>
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
              placeholder="Nova senha (mín. 6 caracteres)" className="w-full border p-3 rounded-xl mb-3" minLength={6} />
            <button onClick={resetPass} className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition mb-2">Confirmar</button>
            <button onClick={() => { setNewPassModal(null); setNewPass('') }} className="w-full text-gray-400 text-sm hover:text-gray-600">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── FINANCEIRO ─── */
function CashFlowTab(_props: { cashFlow: CashFlow[]; setCashFlow: (c: CashFlow[]) => void }) {
  const navigate = useNavigate()
  const [summary, setSummary] = useState(() => getCashFlowSummary())
  useEffect(() => { syncAllData(); setSummary(getCashFlowSummary()) }, [])
  const fmt = (n: number) => n.toLocaleString('pt-AO') + ' AOA'

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-2xl p-5 shadow-md">
          <p className="text-sm opacity-80 font-medium">Saldo Total</p>
          <p className="text-2xl font-black mt-1">{fmt(summary.totalBalance)}</p>
          <p className="text-xs opacity-60 mt-1">{summary.accounts.length} conta(s)</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-2xl p-5 shadow-md">
          <p className="text-sm opacity-80 font-medium">Entradas Hoje</p>
          <p className="text-2xl font-black mt-1">{fmt(summary.todayIncome)}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-2xl p-5 shadow-md">
          <p className="text-sm opacity-80 font-medium">Saídas Hoje</p>
          <p className="text-2xl font-black mt-1">{fmt(summary.todayExpense)}</p>
        </div>
      </div>

      {/* Contas */}
      {summary.accounts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-cyan-600" /> Contas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.accounts.map((acc: any) => (
              <div key={acc.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-semibold text-sm">{acc.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{acc.type === 'cash' ? 'Caixa' : acc.type === 'bank' ? 'Banco' : 'Mobile'}</p>
                </div>
                <p className="font-bold text-sm" style={{ color: acc.color }}>{fmt(acc.balance)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Últimas vendas */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4">Últimas Vendas (POS)</h3>
          {summary.recentSales.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sem vendas registadas</p>
          ) : (
            <div className="space-y-2">
              {summary.recentSales.map((m: any) => (
                <div key={m.id} className="flex justify-between items-center p-3 bg-green-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium">{m.description}</p>
                    <p className="text-xs text-gray-400">{m.created_at ? new Date(m.created_at).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : m.date} · {m.account}</p>
                  </div>
                  <p className="text-sm font-bold text-green-600">+{m.amount.toLocaleString()} AOA</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimas despesas */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4">Últimas Despesas</h3>
          {summary.recentExpenses.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sem despesas registadas</p>
          ) : (
            <div className="space-y-2">
              {summary.recentExpenses.map((m: any) => (
                <div key={m.id} className="flex justify-between items-center p-3 bg-red-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium">{m.description}</p>
                    <p className="text-xs text-gray-400">{m.created_at ? new Date(m.created_at).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : m.date} · {m.account}</p>
                  </div>
                  <p className="text-sm font-bold text-red-600">-{m.amount.toLocaleString()} AOA</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Link para o Fluxo de Caixa completo */}
      <div className="bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-2xl p-6 flex items-center justify-between">
        <div>
          <p className="font-bold text-gray-800">Gestão Completa do Fluxo de Caixa</p>
          <p className="text-sm text-gray-500 mt-1">Movimentos, contas, categorias, relatórios e gráficos</p>
        </div>
        <button onClick={() => navigate('/cashflow')}
          className="flex items-center gap-2 bg-cyan-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-cyan-700 transition text-sm">
          <Wallet className="w-4 h-4" /> Abrir Caixa
        </button>
      </div>
    </div>
  )
}

/* ─── COMPRAS / STOCK ─── */
function PurchasesTab({ products, setProducts, purchases, setPurchases }: any) {
  const [form, setForm] = useState({ pid: '', qty: '', price: '', provider: '', account: '' })
  const cfAccounts: any[] = (() => { try { return JSON.parse(localStorage.getItem('cf_accounts') || '[]') } catch { return [] } })()

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const prod = products.find((p: any) => p.id === form.pid)
    const qty   = Number(form.qty)
    const price = Number(form.price)
    if (!qty || qty <= 0 || !price || price <= 0) { toast.error('Quantidade e preço devem ser maiores que 0'); return }
    const total = qty * price
    const newP = { id: Date.now().toString(), product_id: form.pid, product_name: prod?.name ?? '', quantity: qty, unit_price: price, total_price: total, supplier: form.provider, created_at: new Date().toISOString() }
    const upP = [newP, ...purchases]; setPurchases(upP); localStorage.setItem('khrismir_purchases', JSON.stringify(upP))
    const upProd = products.map((p: any) => p.id === form.pid ? { ...p, stock_quantity: p.stock_quantity + qty } : p)
    setProducts(upProd); localStorage.setItem('khrismir_products', JSON.stringify(upProd))
    syncProducts(upProd)   // ← actualiza stock no Supabase para todos os dispositivos

    // Regista automaticamente no Fluxo de Caixa (ID determinístico evita duplicados no sync)
    registerPurchaseMovement(total, prod?.name || 'Produto', form.provider, form.account || undefined, newP.id)
    syncPurchases([newP])

    setForm({ pid: '', qty: '', price: '', provider: '', account: '' }); toast.success('Compra registada!')
  }
  const exportExcel = () => {
    const rows = purchases.map((p: any) => ({ Data: new Date(p.created_at).toLocaleDateString('pt-AO'), Produto: products.find((x: any) => x.id === p.product_id)?.name || '', Quantidade: p.quantity, 'Preço Custo': p.unit_price, 'Total Custo': p.total_price, Fornecedor: p.supplier || '' }))
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Compras')
    XLSX.writeFile(wb, `khrismir-compras-${new Date().toLocaleDateString('pt-AO').replace(/\//g, '-')}.xlsx`)
    toast.success('Excel exportado!')
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={add} className="bg-white p-6 rounded-2xl shadow-sm space-y-4">
        <h3 className="font-bold text-lg">Entrada de Stock</h3>
        <select value={form.pid} onChange={e => setForm({ ...form, pid: e.target.value })} className="w-full border p-2 rounded-xl" required>
          <option value="">Escolha o Produto</option>
          {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="Quantidade (kg)" className="w-full border p-2 rounded-xl" required min="0.1" step="0.1" />
        <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="Preço Custo (AOA/kg)" className="w-full border p-2 rounded-xl" required min="1" step="1" />
        <input value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} placeholder="Fornecedor" className="w-full border p-2 rounded-xl" />
        {cfAccounts.length > 0 && (
          <select value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} className="w-full border p-2 rounded-xl">
            <option value="">Conta de Pagamento (automático)</option>
            {cfAccounts.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        )}
        <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition">Registar Compra</button>
      </form>
      <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-bold">Histórico de Compras</h3>
          {purchases.length > 0 && <button onClick={exportExcel} className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 transition"><Download className="w-4 h-4" /> Excel</button>}
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
            <tr><th className="p-4">Produto</th><th className="p-4">Qtd.</th><th className="p-4 text-right">Total Custo</th></tr>
          </thead>
          <tbody className="divide-y">
            {purchases.map((p: any) => (
              <tr key={p.id}>
                <td className="p-4 font-medium">{products.find((x: any) => x.id === p.product_id)?.name}</td>
                <td className="p-4 text-sm">{p.quantity} kg</td>
                <td className="p-4 text-right text-red-600 font-bold">{Number(p.total_price).toLocaleString()} Kz</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── ZONAS DE ENTREGA ─── */
function DeliveryTab() {
  const load = (): DeliveryZone[] => { try { return JSON.parse(localStorage.getItem('khrismir_delivery_zones') || '[]') } catch { return [] } }
  const [zones, setZones] = useState<DeliveryZone[]>(load)
  const [form, setForm]   = useState({ name: '', price: '', description: '' })

  const persist = (z: DeliveryZone[]) => { setZones(z); localStorage.setItem('khrismir_delivery_zones', JSON.stringify(z)); syncDeliveryZones(z) }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.price) return
    persist([...zones, { id: Date.now().toString(), name: form.name.trim(), price: Number(form.price), description: form.description }])
    setForm({ name: '', price: '', description: '' }); toast.success('Zona adicionada!')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-6">Nova Zona de Entrega</h2>
        <form onSubmit={add} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome da Zona *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Centralidade, Lubango Centro" required className="w-full border p-3 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Taxa de Entrega (AOA) *</label>
            <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              placeholder="0" required min="0" className="w-full border p-3 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Descrição (opcional)</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ex: Bairros próximos" className="w-full border p-3 rounded-xl" />
          </div>
          <button type="submit" className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition">
            <Plus className="w-4 h-4 inline mr-2" />Adicionar Zona
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-4">💡 Se não houver zonas, a entrega é grátis. O cliente escolhe a zona no carrinho.</p>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-6">Zonas Configuradas</h2>
        {zones.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma zona de entrega configurada</p>
            <p className="text-sm mt-1">Entrega gratuita para todos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {zones.map(z => (
              <div key={z.id} className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl">
                <div>
                  <p className="font-bold">{z.name}</p>
                  {z.description && <p className="text-xs text-gray-500">{z.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-cyan-600">{z.price === 0 ? 'Grátis' : `${z.price.toLocaleString()} Kz`}</span>
                  <button onClick={() => { persist(zones.filter(x => x.id !== z.id)); deleteZone(z.id) }} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── PROMOÇÕES ─── */
function PromosTab() {
  const load = (): PromoCode[] => { try { return JSON.parse(localStorage.getItem('khrismir_promos') || '[]') } catch { return [] } }
  const [promos, setPromos] = useState<PromoCode[]>(load)
  const [form, setForm]     = useState({ code: '', discount_type: 'percentage' as 'percentage' | 'fixed', discount_value: '', min_order: '', max_uses: '', expires_at: '' })

  const persist = (p: PromoCode[]) => { setPromos(p); localStorage.setItem('khrismir_promos', JSON.stringify(p)); syncPromos(p) }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.code.trim() || !form.discount_value) return
    if (promos.find(p => p.code.toUpperCase() === form.code.toUpperCase())) { toast.error('Código já existe'); return }
    const newPromo: PromoCode = {
      id: Date.now().toString(),
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order: Number(form.min_order) || 0,
      uses: 0,
      max_uses: form.max_uses ? Number(form.max_uses) : undefined,
      expires_at: form.expires_at || undefined,
      active: true,
      created_at: new Date().toISOString(),
    }
    persist([...promos, newPromo])
    setForm({ code: '', discount_type: 'percentage', discount_value: '', min_order: '', max_uses: '', expires_at: '' })
    toast.success('Código criado!')
  }

  const toggle = (id: string) => persist(promos.map(p => p.id === id ? { ...p, active: !p.active } : p))
  const del    = (id: string) => { if (confirm('Eliminar código?')) { persist(promos.filter(p => p.id !== id)); deletePromo(id) } }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-6">Novo Código Promocional</h2>
        <form onSubmit={add} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Código *</label>
            <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="Ex: VERAO25" required className="w-full border p-3 rounded-xl font-mono uppercase tracking-widest" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as any }))} className="w-full border p-3 rounded-xl">
                <option value="percentage">Percentagem (%)</option>
                <option value="fixed">Valor Fixo (Kz)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Desconto *</label>
              <input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                placeholder={form.discount_type === 'percentage' ? '10' : '500'} required min="0" className="w-full border p-3 rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Pedido Mínimo (Kz)</label>
              <input type="number" value={form.min_order} onChange={e => setForm(f => ({ ...f, min_order: e.target.value }))}
                placeholder="0" min="0" className="w-full border p-3 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Máx. Utilizações</label>
              <input type="number" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                placeholder="Ilimitado" min="1" className="w-full border p-3 rounded-xl" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Expira em</label>
            <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
              className="w-full border p-3 rounded-xl" />
          </div>
          <button type="submit" className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition">
            <Tag className="w-4 h-4 inline mr-2" />Criar Código
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-6">Códigos Activos</h2>
        {promos.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Tag className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Sem promoções criadas</p></div>
        ) : (
          <div className="space-y-3">
            {promos.map(p => (
              <div key={p.id} className={`p-4 border rounded-2xl ${p.active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-black font-mono text-lg tracking-widest text-cyan-700">{p.code}</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {p.discount_type === 'percentage' ? `${p.discount_value}% desconto` : `${p.discount_value.toLocaleString()} Kz desconto`}
                      {p.min_order > 0 && ` • Mín: ${p.min_order.toLocaleString()} Kz`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Utilizações: {p.uses}{p.max_uses ? `/${p.max_uses}` : ''}
                      {p.expires_at && ` • Expira: ${new Date(p.expires_at).toLocaleDateString('pt-AO')}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggle(p.id)}
                      className={`text-xs px-2 py-1 rounded-lg font-bold ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.active ? 'Activo' : 'Inactivo'}
                    </button>
                    <button onClick={() => del(p.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── AGT / FISCAL ─── */
function AGTTab({ orders, storeSettings, purchases }: { orders: Order[]; storeSettings: StoreSettings; purchases: Purchase[] }) {
  const ivaRate = storeSettings.iva_rate / 100
  const totalFaturado = orders.filter(o => o.status !== 'cancelado').reduce((s, o) => s + o.total, 0)
  const _totalIVA = totalFaturado * ivaRate; void _totalIVA

  const [saftYear, setSaftYear] = useState(new Date().getFullYear())

  const exportSAFT = () => {
    if (orders.length === 0) { toast.error('Sem facturas para exportar'); return }
    const xml = generateSAFTXML(orders, storeSettings, saftYear)
    downloadSAFT(xml, storeSettings.nif || 'SEMNNIF', saftYear)
    toast.success(`SAF-T/AO ${saftYear} exportado em XML — schema AO_1.01_01`)
  }

  const exportExcel = () => {
    const rows = orders.map(o => ({
      'Nº Fatura':          o.order_number,
      'Data':               o.created_at.slice(0, 10),
      'Cliente':            o.customer_name || 'Consumidor Final',
      'NIF Cliente':        o.customer_nif || '',
      'Total Bruto':        o.total,
      [`IVA (${storeSettings.iva_rate}%)`]: (o.total * ivaRate / (1 + ivaRate)).toFixed(2),
      'Total Líquido':      (o.total / (1 + ivaRate)).toFixed(2),
      'Estado':             statusConfig[o.status]?.label || o.status,
      'Pagamento':          o.payment_type,
      'Hash AGT':           o.hash || '—',
    }))
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Faturas')
    XLSX.writeFile(wb, `khrismir-fiscal-${new Date().getFullYear()}.xlsx`)
    toast.success('Relatório fiscal exportado!')
  }

  const [balanceMonth, setBalanceMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const exportMonthlyBalance = () => {
    const [y, m] = balanceMonth.split('-').map(Number)
    const monthOrders = orders.filter(o => {
      const d = new Date(o.created_at); return d.getFullYear() === y && d.getMonth() + 1 === m && o.status !== 'cancelado'
    })
    const monthPurchases = purchases.filter(p => {
      const d = new Date(p.date); return d.getFullYear() === y && d.getMonth() + 1 === m
    })
    const revenue = monthOrders.reduce((s, o) => s + o.total, 0)
    const costs = monthPurchases.reduce((s, p) => s + p.total, 0)
    const wb = XLSX.utils.book_new()
    const resumo = [
      { Item: 'Receitas (Vendas)', Valor: revenue },
      { Item: 'Custos (Compras)', Valor: costs },
      { Item: 'Lucro Bruto', Valor: revenue - costs },
      { Item: `IVA (${storeSettings.iva_rate}%)`, Valor: revenue * ivaRate },
      { Item: 'Lucro Líquido', Valor: (revenue - costs) - revenue * ivaRate },
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      monthOrders.map(o => ({ 'Nº': o.order_number, 'Data': o.created_at.slice(0, 10), 'Cliente': o.customer_name || 'POS', 'Total': o.total, 'Pagamento': o.payment_type }))
    ), 'Vendas')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      monthPurchases.map(p => ({ 'Data': p.date.slice(0, 10), 'Fornecedor': p.supplier, 'Total': p.total }))
    ), 'Compras')
    XLSX.writeFile(wb, `balanço-${balanceMonth}.xlsx`)
    toast.success(`Balanço de ${balanceMonth} exportado!`)
  }

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border-t-4 border-orange-500">
      <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800">Conformidade AGT</h2>
          <p className="text-gray-500 text-sm">IVA {storeSettings.iva_rate}% • NIF: {storeSettings.nif} • Decreto Presidencial n.º 71/25</p>
        </div>
        <div className="bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wide">SAF-T/AO 1.01.01</div>
      </div>

      {(() => {
        const comHash = orders.filter(o => o.hash).length
        const semHash = orders.length - comHash
        const pct = orders.length > 0 ? Math.round(comHash / orders.length * 100) : 0
        return semHash > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800">Facturas sem hash: {semHash}</p>
              <p className="text-sm text-amber-700">{comHash} de {orders.length} facturas têm hash AGT ({pct}%). As mais antigas foram criadas antes da actualização. O SAF-T calculará o hash em falta na exportação.</p>
            </div>
          </div>
        ) : orders.length > 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <FileText className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-800">Todas as {orders.length} facturas têm hash de autenticação AGT ✓</p>
          </div>
        ) : null
      })()}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
          <p className="text-gray-400 text-xs uppercase font-bold tracking-widest mb-1">Total Faturado</p>
          <p className="text-xl font-black text-gray-800">{totalFaturado.toLocaleString()} Kz</p>
        </div>
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
          <p className="text-gray-400 text-xs uppercase font-bold tracking-widest mb-1">IVA ({storeSettings.iva_rate}%)</p>
          <p className="text-xl font-black text-gray-800">{(totalFaturado * ivaRate / (1 + ivaRate)).toLocaleString(undefined, { maximumFractionDigits: 0 })} Kz</p>
        </div>
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
          <p className="text-gray-400 text-xs uppercase font-bold tracking-widest mb-1">Nº Facturas</p>
          <p className="text-xl font-black text-gray-800">{orders.length}</p>
        </div>
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
          <p className="text-gray-400 text-xs uppercase font-bold tracking-widest mb-1">Com Hash AGT</p>
          <p className="text-xl font-black text-gray-800">{orders.filter(o => o.hash).length}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 border-2 border-dashed border-gray-200 rounded-2xl hover:border-orange-400 hover:bg-orange-50 transition group">
          <div className="flex items-center gap-3 mb-3">
            <Upload className="text-gray-300 group-hover:text-orange-500 w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold group-hover:text-orange-700">Exportar SAF-T/AO</p>
              <p className="text-xs text-gray-400">Schema AO_1.01_01 • XML • Hash encadeado</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <select value={saftYear} onChange={e => setSaftYear(Number(e.target.value))} className="border p-2 rounded-lg text-sm flex-1">
              {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={exportSAFT} className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600 transition">Exportar</button>
          </div>
        </div>
        <button onClick={exportExcel}
          className="flex items-center gap-3 p-5 border-2 border-dashed border-gray-200 rounded-2xl hover:border-green-400 hover:bg-green-50 transition group">
          <Download className="text-gray-300 group-hover:text-green-500 w-6 h-6" />
          <div className="text-left">
            <p className="font-bold group-hover:text-green-700">Exportar Excel Fiscal</p>
            <p className="text-xs text-gray-400">Relatório detalhado de todas as faturas</p>
          </div>
        </button>
      </div>

      <div className="mt-8 pt-8 border-t border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-purple-600" /> Balanço Mensal Automático</h3>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Selecione o mês</label>
            <input type="month" value={balanceMonth} onChange={e => setBalanceMonth(e.target.value)} className="border p-2.5 rounded-xl" />
          </div>
          <button onClick={exportMonthlyBalance}
            className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-purple-700 transition">
            <Download className="w-4 h-4" /> Exportar Balanço
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Exporta Excel com Vendas, Compras, Lucro Bruto e Lucro Líquido</p>
      </div>
    </div>
  )
}

/* ─── CONFIGURAÇÕES ─── */
function SettingsTab({ settings, onSave }: { settings: StoreSettings; onSave: (s: StoreSettings) => void }) {
  const [form, setForm] = useState<StoreSettings>({ ...settings })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(form)
    toast.success('Configurações guardadas!')
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm max-w-2xl">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Settings className="w-5 h-5 text-cyan-600" /> Configurações da Loja</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            { field: 'name',     label: 'Nome da Loja',     type: 'text',   placeholder: 'Peixaria Khrismir'   },
            { field: 'phone',    label: 'Telefone',          type: 'tel',    placeholder: '+244 929 970 984'    },
            { field: 'whatsapp', label: 'WhatsApp (sem +)',  type: 'text',   placeholder: '244929970984'        },
            { field: 'email',    label: 'Email',             type: 'email',  placeholder: 'loja@email.com'      },
            { field: 'nif',      label: 'NIF',               type: 'text',   placeholder: '5001210092'          },
            { field: 'iva_rate', label: 'Taxa IVA (%)',       type: 'number', placeholder: '14'                  },
          ].map(({ field, label, type, placeholder }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type={type} value={(form as any)[field]} placeholder={placeholder}
                onChange={e => setForm(f => ({ ...f, [field]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-cyan-500" required />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
          <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Rua, Bairro, Cidade, Província" className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-cyan-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Horário de Funcionamento</label>
          <input type="text" value={form.opening_hours} onChange={e => setForm(f => ({ ...f, opening_hours: e.target.value }))}
            placeholder="Seg–Sáb: 07:00–18:00" className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-cyan-500" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex items-center gap-3 p-4 border rounded-xl">
            <input type="checkbox" id="delivery_enabled" checked={form.delivery_enabled}
              onChange={e => setForm(f => ({ ...f, delivery_enabled: e.target.checked }))} className="w-4 h-4" />
            <label htmlFor="delivery_enabled" className="text-sm font-medium cursor-pointer">Entrega a domicílio activa</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pedido Mínimo Delivery (Kz)</label>
            <input type="number" value={form.min_order_delivery} onChange={e => setForm(f => ({ ...f, min_order_delivery: Number(e.target.value) }))}
              min="0" className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-cyan-500" />
          </div>
        </div>

        {/* Dados Fiscais */}
        <div className="border-t pt-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full inline-block" /> Dados Fiscais (para Facturas AGT)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { field: 'capital_social', label: 'Capital Social', placeholder: 'Ex: 10.000.000,00 AKZ' },
              { field: 'cons_reg_com',   label: 'Cons. Reg. Com.', placeholder: 'Ex: 001-01012020-LUA' },
            ].map(({ field, label, placeholder }) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" value={(form as any)[field] ?? ''} placeholder={placeholder}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-amber-400" />
              </div>
            ))}
          </div>
        </div>

        {/* Dados Bancários */}
        <div className="border-t pt-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full inline-block" /> Dados Bancários (aparecem na Fatura)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { field: 'bank_name',    label: 'Banco',         placeholder: 'Ex: BAI' },
              { field: 'bank_account', label: 'N.º de Conta',  placeholder: 'Ex: 123456789' },
              { field: 'bank_iban',    label: 'IBAN',          placeholder: 'Ex: AO06.0040...' },
            ].map(({ field, label, placeholder }) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" value={(form as any)[field] ?? ''} placeholder={placeholder}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-400" />
              </div>
            ))}
          </div>
        </div>

        <button type="submit" className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-bold hover:from-cyan-700 hover:to-blue-700 transition">
          Guardar Configurações
        </button>
      </form>
    </div>
  )
}

/* ─── RELATÓRIOS PDF ─── */
function ReportsTab({ orders, purchases, storeSettings }: { orders: Order[]; purchases: Purchase[]; storeSettings: StoreSettings }) {
  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)

  const [dailyDate, setDailyDate]   = useState(today)
  const [salesMonth, setSalesMonth] = useState(thisMonth)
  const [purchFrom, setPurchFrom]   = useState(today.slice(0, 8) + '01')
  const [purchTo,   setPurchTo]     = useState(today)
  const [moMonth,   setMoMonth]     = useState(thisMonth)
  const [cfFrom,    setCfFrom]      = useState(today.slice(0, 8) + '01')
  const [cfTo,      setCfTo]        = useState(today)

  const cashFlow: CashFlow[] = (() => {
    try { return JSON.parse(localStorage.getItem('khrismir_cashflow') || '[]') } catch { return [] }
  })()

  const card = (icon: React.ReactNode, title: string, desc: string, children: React.ReactNode) => (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">{icon}</div>
        <div><p className="font-bold text-gray-800">{title}</p><p className="text-xs text-gray-400">{desc}</p></div>
      </div>
      {children}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <FileBarChart2 className="w-6 h-6 text-cyan-600" />
        <div>
          <h2 className="text-xl font-bold text-gray-800">Relatórios PDF</h2>
          <p className="text-xs text-gray-400">Todos os relatórios abrem numa nova janela para imprimir ou guardar como PDF</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Vendas Diárias */}
        {card(
          <FileBarChart2 className="w-5 h-5" />,
          'Relatório de Vendas Diário',
          'Todas as vendas de um dia com totais, IVA e meios de pagamento',
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Data</label>
              <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
                className="w-full border p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-cyan-400" />
            </div>
            <button onClick={() => printDailySalesReport(orders, storeSettings, dailyDate)}
              className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-cyan-700 transition">
              <Download className="w-4 h-4" /> PDF
            </button>
          </div>
        )}

        {/* Vendas Mensais */}
        {card(
          <CalendarDays className="w-5 h-5" />,
          'Relatório de Vendas Mensal',
          'Vendas por dia, por método de pagamento e detalhe completo',
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Mês</label>
              <input type="month" value={salesMonth} onChange={e => setSalesMonth(e.target.value)}
                className="w-full border p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-cyan-400" />
            </div>
            <button onClick={() => {
              const [y, m] = salesMonth.split('-').map(Number)
              printMonthlySalesReport(orders, storeSettings, y, m)
            }}
              className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-cyan-700 transition">
              <Download className="w-4 h-4" /> PDF
            </button>
          </div>
        )}

        {/* Compras */}
        {card(
          <ShoppingBag className="w-5 h-5" />,
          'Relatório de Compras',
          'Compras por fornecedor, tipo e detalhe de artigos no período',
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">De</label>
                <input type="date" value={purchFrom} onChange={e => setPurchFrom(e.target.value)}
                  className="w-full border p-2.5 rounded-xl text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Até</label>
                <input type="date" value={purchTo} onChange={e => setPurchTo(e.target.value)}
                  className="w-full border p-2.5 rounded-xl text-sm" />
              </div>
            </div>
            <button onClick={() => printPurchasesReport(purchases, storeSettings, purchFrom, purchTo)}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-700 transition">
              <Download className="w-4 h-4" /> Gerar PDF de Compras
            </button>
          </div>
        )}

        {/* Relatório Mensal Completo */}
        {card(
          <TrendingUp className="w-5 h-5" />,
          'Relatório Mensal Completo',
          'Vendas + Compras + Balanço + Top Produtos — resumo executivo',
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Mês</label>
              <input type="month" value={moMonth} onChange={e => setMoMonth(e.target.value)}
                className="w-full border p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-purple-400" />
            </div>
            <button onClick={() => {
              const [y, m] = moMonth.split('-').map(Number)
              printMonthlyReport(orders, purchases, storeSettings, y, m)
            }}
              className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-purple-700 transition">
              <Download className="w-4 h-4" /> PDF
            </button>
          </div>
        )}

        {/* Fluxo de Caixa */}
        {card(
          <Wallet className="w-5 h-5" />,
          'Relatório de Fluxo de Caixa',
          'Todas as entradas e saídas de caixa no período',
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">De</label>
                <input type="date" value={cfFrom} onChange={e => setCfFrom(e.target.value)}
                  className="w-full border p-2.5 rounded-xl text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Até</label>
                <input type="date" value={cfTo} onChange={e => setCfTo(e.target.value)}
                  className="w-full border p-2.5 rounded-xl text-sm" />
              </div>
            </div>
            <button onClick={() => printCashFlowReport(cashFlow, storeSettings, cfFrom, cfTo)}
              className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 transition">
              <Download className="w-4 h-4" /> Gerar PDF de Caixa
            </button>
          </div>
        )}

      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-700">
        <p className="font-bold mb-1">💡 Como guardar em PDF</p>
        <p>Ao clicar em qualquer botão PDF, abre uma nova janela. Na caixa de impressão, seleccione <strong>"Guardar como PDF"</strong> como impressora.</p>
      </div>
    </div>
  )
}

/* ─── SESSÕES ONLINE ─── */
function SessionsTab() {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])

  useEffect(() => {
    const unsub = subscribePresence(users => setOnlineUsers(users))
    return unsub
  }, [])

  const roleLabel: Record<string, string> = { admin: 'Administrador', employee: 'Funcionário', gerente: 'Gerente', client: 'Cliente' }
  const roleColor: Record<string, string> = {
    admin:    'bg-red-100 text-red-700',
    employee: 'bg-blue-100 text-blue-700',
    gerente:  'bg-purple-100 text-purple-700',
    client:   'bg-green-100 text-green-700',
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <Monitor className="w-6 h-6 text-cyan-600" />
        <div>
          <h2 className="text-xl font-bold text-gray-800">Sessões Online</h2>
          <p className="text-xs text-gray-400">Utilizadores com sessão activa neste momento</p>
        </div>
        <span className="ml-auto bg-green-100 text-green-700 text-sm font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
          <span className="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse" />
          {onlineUsers.length} online
        </span>
      </div>

      {onlineUsers.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum utilizador online de momento</p>
          <p className="text-xs mt-1">O tracking por Presence requer ligação Supabase</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {onlineUsers.map((u, i) => (
            <div key={`${u.id}-${i}`} className="border rounded-2xl p-4 bg-gray-50/50 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-700 font-bold text-sm shrink-0">
                {u.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800 truncate">{u.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${roleColor[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                    {roleLabel[u.role] ?? u.role}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-gray-500">{u.device}</span>
                  <span className="text-xs text-gray-400">
                    Desde {new Date(u.joinedAt).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full mt-1 shrink-0 animate-pulse" title="Online" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── SISTEMA ─── */
function SystemTab({ products, categories }: { products: Product[]; categories: Category[] }) {
  const [syncing,      setSyncing]      = useState(false)
  const [backupMeta,   setBackupMeta]   = useState<BackupMeta | null>(getLastBackupMeta)
  const [backingUp,    setBackingUp]    = useState(false)
  const [deploying,    setDeploying]    = useState(false)
  const [deployLogs,   setDeployLogs]   = useState<string[]>([])
  const [deployResult, setDeployResult] = useState<{ ok: boolean; message: string } | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const isElectron = !!(window as any).electronAPI?.isElectron

  // Scroll automático nos logs de deploy
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [deployLogs])

  const handleBackupNow = async () => {
    setBackingUp(true)
    // Faz push completo para Supabase (o Realtime notifica os outros dispositivos)
    await pushAll()
    setBackupMeta(getLastBackupMeta())
    setBackingUp(false)
    toast.success('✅ Dados enviados para a cloud!')
  }

  const handleRestoreLocalBackup = () => {
    if (!backupMeta) { toast.error('Sem backup automático disponível'); return }
    if (!confirm(`Restaurar backup de ${new Date(backupMeta.timestamp).toLocaleString('pt-AO')}?\nOs dados actuais serão substituídos.`)) return
    const ok = restoreLocalBackup()
    if (ok) { toast.success('✅ Backup restaurado localmente!'); setTimeout(() => window.location.reload(), 1200) }
    else toast.error('Falha ao restaurar backup')
  }

  const handleDeployAll = async () => {
    if (!isElectron) return
    setDeploying(true)
    setDeployLogs([])
    setDeployResult(null)

    const api = (window as any).electronAPI
    api.onDeployLog((msg: string) => setDeployLogs(prev => [...prev, msg]))
    const result = await api.deployAll()
    setDeployResult(result)
    setDeploying(false)
  }

  const syncAll = async () => {
    setSyncing(true)
    const tid = toast.loading('A sincronizar todos os dados com a cloud…')
    const result = await pushAll()
    toast.dismiss(tid)
    setSyncing(false)
    if (result.ok) {
      toast.success(`Sincronização concluída! ${(result.details ?? []).filter(d => typeof d === 'string' && d.startsWith('✅')).length} tabelas actualizadas.`)
    } else {
      const erros = (result.details ?? []).filter(d => typeof d === 'string' && d.startsWith('❌'))
      const msg = erros.length ? erros.join(' | ') : (result.error ?? 'Erro desconhecido')
      toast.error(`Sincronização falhou: ${msg}`, { duration: 10000 })
      ;(result.details ?? []).forEach(d => console.warn('[sync]', d))
    }
  }

  const runMigration = () => {
    // Força re-migração removendo a flag
    localStorage.removeItem('cf_migration_done_v1')
    const { imported, skipped } = migrateExistingData(true)
    if (imported > 0) {
      toast.success(`Migração concluída: ${imported} registos importados para o Fluxo de Caixa`)
    } else {
      toast.info(`Nenhum registo novo encontrado (${skipped} já existiam)`)
    }
  }

  const BACKUP_MAP: Record<string, string> = {
    products:     'khrismir_products',
    categories:   'khrismir_categories',
    orders:       'khrismir_orders',
    cashflow:     'khrismir_cashflow',
    purchases:    'khrismir_purchases',
    employees:    'khrismir_employees',
    settings:     'khrismir_settings',
    promos:       'khrismir_promos',
    delivery:     'khrismir_delivery_zones',
    shifts:       'khrismir_shifts',
    loyalty:      'khrismir_loyalty',
    clients:      'khrismir_clients',
    cf_movements: 'cf_movements',
    cf_accounts:  'cf_accounts',
    cf_categories:'cf_categories',
  }

  const downloadBackup = () => {
    const ls = (k: string, fb: any) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fb } catch { return fb } }
    const data: Record<string, any> = { exportedAt: new Date().toISOString() }
    Object.entries(BACKUP_MAP).forEach(([key, lsKey]) => { data[key] = ls(lsKey, []) })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url
    a.download = `khrismir-backup-${new Date().toLocaleDateString('pt-AO').replace(/\//g, '-')}.json`; a.click(); URL.revokeObjectURL(url)
    toast.success('Backup descarregado!')
  }

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data.exportedAt && !data.products) { toast.error('Ficheiro inválido — não é um backup Khrismir'); return }

        // Confirmação obrigatória — restauro total apaga tudo
        const ok = confirm(
          `⚠️ RESTAURO TOTAL\n\nEsta acção vai:\n` +
          `1. Apagar TODOS os dados existentes (local e cloud)\n` +
          `2. Carregar apenas os dados deste backup (${new Date(data.exportedAt).toLocaleString('pt-AO')})\n\n` +
          `Continuar?`
        )
        if (!ok) { e.target.value = ''; return }

        // ── FASE 1: Apagar tudo ──────────────────────────────────
        const tid = toast.loading('Fase 1/3 — A apagar dados existentes…')

        // 1a. Apagar Supabase via RPC reset_all_data() (SECURITY DEFINER — bypassa RLS)
        await clearAllData()

        // 1b. Limpar localStorage completamente
        localStorage.clear()

        // ── FASE 2: Carregar backup ──────────────────────────────
        toast.loading('Fase 2/3 — A carregar dados do backup…', { id: tid })

        // Desduplicar ordens por order_number antes de restaurar
        // (previne duplicate key se o backup tiver o mesmo order_number com ids diferentes)
        if (Array.isArray(data.orders)) {
          const seen = new Set<string>()
          data.orders = data.orders.filter((o: any) => {
            const key = o.order_number || o.id
            if (!key || seen.has(key)) return false
            seen.add(key)
            return true
          })
        }

        // Escrever backup no localStorage
        Object.entries(BACKUP_MAP).forEach(([key, lsKey]) => {
          if (data[key] !== undefined) localStorage.setItem(lsKey, JSON.stringify(data[key]))
        })

        // ── FASE 3: Sincronizar para cloud ───────────────────────
        toast.loading('Fase 3/3 — A sincronizar com a cloud…', { id: tid })
        const result = await pushAll()

        toast.dismiss(tid)
        if (result.ok) {
          toast.success(`✅ Restauro completo! ${(result.details ?? []).filter(d => typeof d === 'string' && d.startsWith('✅')).length} tabelas sincronizadas.`)
        } else {
          toast.success('✅ Backup restaurado localmente.')
          toast.warning('Sincronização cloud parcial — verifique a ligação.')
        }
        setTimeout(() => window.location.reload(), 1800)
      } catch (err) { toast.error('Ficheiro inválido ou corrompido') }
    }
    reader.readAsText(file); e.target.value = ''
  }

  const handleReset = async () => {
    if (!confirm('⚠️ ATENÇÃO\n\nEsta acção apaga TODOS os dados:\n• Produtos, categorias, encomendas\n• Compras, caixa, movimentos\n• Turnos, promoções, entregas\n\nOs dados serão eliminados do local E da cloud.\n\nContinuar?')) return
    if (!confirm('Última confirmação — não é possível recuperar os dados depois.\n\nApagar tudo?')) return

    const tid = toast.loading('A apagar todos os dados…')
    // Limpar localStorage
    localStorage.clear()
    // Limpar Supabase
    await clearAllData()
    toast.dismiss(tid)
    toast.success('Sistema reiniciado — todos os dados apagados.')
    setTimeout(() => window.location.reload(), 1500)
  }

  // Restaurar dados a partir da cloud (limpa localStorage local e puxa Supabase)
  // Útil quando outro dispositivo já fez o backup restore e este ainda tem dados antigos
  const handleRestoreFromCloud = async () => {
    if (!confirm(
      '☁️ RESTAURAR DA CLOUD\n\n' +
      'Esta acção vai:\n' +
      '1. Apagar os dados locais deste dispositivo\n' +
      '2. Puxar os dados actuais do Supabase\n\n' +
      'O Supabase NÃO será alterado.\n\nContinuar?'
    )) return

    const tid = toast.loading('Fase 1/2 — A limpar dados locais…')
    // Preservar credenciais de sessão (não apagar o login)
    const sessionKeys = ['khrismir_user', 'khrismir_settings']
    const saved: Record<string, string> = {}
    sessionKeys.forEach(k => { const v = localStorage.getItem(k); if (v) saved[k] = v })

    localStorage.clear()

    // Restaurar sessão
    Object.entries(saved).forEach(([k, v]) => localStorage.setItem(k, v))

    toast.loading('Fase 2/2 — A puxar dados da cloud…', { id: tid })
    try {
      await pullAll()
      toast.dismiss(tid)
      toast.success('✅ Dados restaurados da cloud com sucesso!')
      setTimeout(() => window.location.reload(), 1200)
    } catch (e: any) {
      toast.dismiss(tid)
      toast.error('Erro ao puxar dados da cloud: ' + (e?.message ?? 'desconhecido'))
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border-t-4 border-gray-800 max-w-2xl space-y-5">
      <h2 className="text-xl font-bold">Configurações de Sistema</h2>

      {/* ── Backup Automático ──────────────────────────────── */}
      <div className="p-4 border-2 border-cyan-200 rounded-2xl bg-cyan-50/40 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h4 className="font-bold text-cyan-800 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Backup Automático (30 em 30 min)
            </h4>
            <p className="text-xs text-cyan-600 mt-0.5">
              Guarda snapshot local → envia para Supabase → importa dados actualizados da cloud.
            </p>
          </div>
          <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">● Activo</span>
        </div>

        {backupMeta && (
          <div className="text-xs text-cyan-700 bg-white/70 rounded-xl px-3 py-2 border border-cyan-100">
            <span className="font-bold">Último backup:</span>{' '}
            {new Date(backupMeta.timestamp).toLocaleString('pt-AO')}{' '}
            &nbsp;•&nbsp; {backupMeta.keys} tabelas{' '}
            &nbsp;•&nbsp; {(backupMeta.size / 1024).toFixed(1)} KB
          </div>
        )}
        {!backupMeta && (
          <p className="text-xs text-cyan-500 italic">Ainda sem backup automático nesta sessão.</p>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={handleBackupNow} disabled={backingUp}
            className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-cyan-700 transition disabled:opacity-60">
            <RotateCcw className={`w-4 h-4 ${backingUp ? 'animate-spin' : ''}`} />
            {backingUp ? 'A fazer backup…' : 'Fazer Backup Agora'}
          </button>
          <button onClick={handleRestoreLocalBackup} disabled={!backupMeta}
            className="flex items-center gap-2 bg-white border-2 border-cyan-300 text-cyan-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-cyan-50 transition disabled:opacity-40">
            <Upload className="w-4 h-4" /> Restaurar Último Backup
          </button>
        </div>
      </div>

      {/* ── Deploy Completo (apenas Electron) ─────────────── */}
      {isElectron && (
        <div className="p-4 border-2 border-purple-200 rounded-2xl bg-purple-50/40 space-y-3">
          <div>
            <h4 className="font-bold text-purple-800 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Deploy Completo (Browser + Electron)
            </h4>
            <p className="text-xs text-purple-600 mt-0.5">
              Equivale a <code className="bg-purple-100 px-1 rounded">npm run deploy:all</code> — compila e publica browser (Vercel) e actualiza o executável Electron.
            </p>
          </div>

          <button onClick={handleDeployAll} disabled={deploying}
            className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-purple-700 transition disabled:opacity-60">
            <RotateCcw className={`w-4 h-4 ${deploying ? 'animate-spin' : ''}`} />
            {deploying ? 'A fazer deploy…' : '🚀 Deploy Completo Agora'}
          </button>

          {deployLogs.length > 0 && (
            <div className="bg-gray-900 text-green-400 rounded-xl p-3 font-mono text-xs max-h-48 overflow-y-auto space-y-0.5">
              {deployLogs.map((line, i) => (
                <div key={i} className={line.startsWith('❌') || line.startsWith('⚠') ? 'text-red-400' : line.startsWith('✅') ? 'text-green-300 font-bold' : ''}>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}

          {deployResult && (
            <div className={`text-sm font-bold px-3 py-2 rounded-xl ${deployResult.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {deployResult.message}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded-2xl space-y-4">
          <div>
            <h4 className="font-bold mb-1">Base de Dados Local</h4>
            <p className="text-sm text-gray-500">{products.length} produtos • {categories.length} categorias</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={downloadBackup} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition">
              <Download className="w-4 h-4" /> Baixar Backup
            </button>
            <label className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-200 transition">
              <Upload className="w-4 h-4" /> Importar Backup
              <input type="file" accept=".json" onChange={importBackup} className="hidden" />
            </label>
          </div>
        </div>
        <div className="p-4 border border-green-100 rounded-2xl bg-green-50/30">
          <h4 className="font-bold text-green-800 mb-1">☁️ Restaurar da Cloud</h4>
          <p className="text-sm text-green-700 mb-3">
            Limpa os dados locais deste dispositivo e puxar os dados actuais do Supabase.<br />
            <span className="text-xs text-green-600">Use quando outro dispositivo já fez o restore e este ainda tem dados antigos.</span>
          </p>
          <button onClick={handleRestoreFromCloud}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-700 transition">
            <RotateCcw className="w-4 h-4" /> Restaurar da Cloud
          </button>
        </div>
        <div className="p-4 border border-cyan-100 rounded-2xl bg-cyan-50/30">
          <h4 className="font-bold text-cyan-800 mb-2">Fluxo de Caixa</h4>
          <p className="text-sm text-cyan-700 mb-3">Importar compras e movimentos históricos para o Fluxo de Caixa.</p>
          <button onClick={runMigration}
            className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-cyan-700 transition">
            <Upload className="w-4 h-4" /> Importar Dados Históricos
          </button>
        </div>
        <div className="p-4 border border-red-100 rounded-2xl bg-red-50/30">
          <h4 className="font-bold text-red-800 mb-2">⚠️ Zona de Perigo</h4>
          <p className="text-sm text-red-600/70 mb-1">Apaga <strong>todos</strong> os dados — local e na cloud (Supabase).</p>
          <p className="text-xs text-red-400 mb-4">Produtos, encomendas, compras, caixa, turnos e promoções serão eliminados permanentemente.</p>
          <button onClick={handleReset}
            className="text-red-600 border-2 border-red-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-600 hover:text-white transition">
            🗑️ Reset Total (Local + Cloud)
          </button>
        </div>
      </div>
      <div className="bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl p-5 text-white">
        <p className="font-bold text-lg mb-1">☁️ Sincronizar com Cloud (Supabase)</p>
        <p className="text-cyan-100 text-sm mb-4">Envia todos os dados locais (produtos, categorias, encomendas, zonas, promoções, configurações) para o Supabase. Qualquer aparelho verá os dados actualizados.</p>
        <div className="flex gap-3 flex-wrap">
          <button onClick={syncAll} disabled={syncing}
            className="bg-white text-cyan-700 font-bold px-6 py-2 rounded-xl hover:bg-cyan-50 transition disabled:opacity-60 flex items-center gap-2">
            <RotateCcw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'A sincronizar…' : 'Sincronizar Agora'}
          </button>
          <button onClick={() => { localStorage.removeItem('khrismir_auto_synced'); syncAll() }} disabled={syncing}
            className="bg-cyan-700 text-white font-bold px-4 py-2 rounded-xl hover:bg-cyan-800 transition disabled:opacity-60 text-sm">
            Forçar Re-sincronização
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── FORNECEDORES ─── */
function SuppliersTab() {
  const load = (): Supplier[] => { try { return JSON.parse(localStorage.getItem('khrismir_suppliers') || '[]') } catch { return [] } }
  const [suppliers, setSuppliers] = useState<Supplier[]>(load)
  const [form, setForm] = useState({ name: '', nif: '', phone: '', email: '', address: '', notes: '' })
  const [editing, setEditing] = useState<Supplier | null>(null)

  // Recarregar quando Realtime notificar mudança na tabela suppliers
  useEffect(() => {
    const handleSync = (e: Event) => {
      const t = (e as CustomEvent).detail?.table
      if (!t || t === 'suppliers') setSuppliers(load())
    }
    window.addEventListener('khrismir:sync', handleSync)
    return () => window.removeEventListener('khrismir:sync', handleSync)
  }, [])

  const persist = (s: Supplier[]) => {
    setSuppliers(s)
    localStorage.setItem('khrismir_suppliers', JSON.stringify(s))
    syncSuppliers(s)   // ← propaga para Supabase em tempo real
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (editing) {
      persist(suppliers.map(s => s.id === editing.id ? { ...editing, ...form } : s))
      setEditing(null)
      toast.success('Fornecedor actualizado!')
    } else {
      persist([...suppliers, { id: Date.now().toString(), ...form, created_at: new Date().toISOString() }])
      toast.success('Fornecedor criado!')
    }
    setForm({ name: '', nif: '', phone: '', email: '', address: '', notes: '' })
  }

  const del = (id: string) => { if (!confirm('Eliminar fornecedor?')) return; persist(suppliers.filter(s => s.id !== id)); toast.success('Eliminado') }
  const doEdit = (s: Supplier) => { setEditing(s); setForm({ name: s.name, nif: s.nif || '', phone: s.phone || '', email: s.email || '', address: s.address || '', notes: s.notes || '' }) }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={save} className="bg-white p-6 rounded-2xl shadow-sm space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2"><Truck className="w-5 h-5 text-cyan-600" />{editing ? 'Editar' : 'Novo'} Fornecedor</h3>
        <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome *" className="w-full border p-3 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <input value={form.nif} onChange={e => setForm(f => ({ ...f, nif: e.target.value }))} placeholder="NIF" className="border p-3 rounded-xl" />
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Telefone" className="border p-3 rounded-xl" />
        </div>
        <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className="w-full border p-3 rounded-xl" />
        <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Endereço" className="w-full border p-3 rounded-xl" />
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas" rows={2} className="w-full border p-3 rounded-xl resize-none" />
        <button type="submit" className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition">
          {editing ? 'Guardar Alterações' : 'Adicionar Fornecedor'}
        </button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: '', nif: '', phone: '', email: '', address: '', notes: '' }) }} className="w-full text-gray-400 text-sm hover:text-gray-600">Cancelar</button>}
      </form>
      <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-6">
        <h3 className="font-bold mb-4">{suppliers.length} Fornecedor(es)</h3>
        {suppliers.length === 0 ? (
          <div className="text-center py-16 text-gray-400"><Truck className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Sem fornecedores registados</p></div>
        ) : (
          <div className="space-y-3">
            {suppliers.map(s => (
              <div key={s.id} className="border border-gray-100 rounded-2xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-800">{s.name}</p>
                    {s.nif && <p className="text-xs text-gray-500">NIF: {s.nif}</p>}
                    <div className="flex flex-wrap gap-3 mt-1">
                      {s.phone && <p className="text-xs text-gray-500">📞 {s.phone}</p>}
                      {s.email && <p className="text-xs text-gray-500">✉️ {s.email}</p>}
                      {s.address && <p className="text-xs text-gray-500">📍 {s.address}</p>}
                    </div>
                    {s.notes && <p className="text-xs text-gray-400 mt-1 italic">{s.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => doEdit(s)} className="text-gray-400 hover:text-cyan-600 p-1 transition"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => del(s.id)} className="text-gray-400 hover:text-red-600 p-1 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── DEVOLUÇÕES ─── */
function ReturnsTab({ orders, products, setProducts, setOrders }: {
  orders: Order[]; products: Product[]; setProducts: (p: Product[]) => void; setOrders: (o: Order[]) => void
}) {
  const load = (): Return[] => { try { return JSON.parse(localStorage.getItem('khrismir_returns') || '[]') } catch { return [] } }
  const [returns, setReturns] = useState<Return[]>(load)
  const [modal, setModal] = useState<Order | null>(null)
  const [reason, setReason] = useState('')

  const deliveredOrders = orders.filter(o => o.status === 'entregue')
  const returnedIds = new Set(returns.map(r => r.order_id))

  const persist = (r: Return[]) => { setReturns(r); localStorage.setItem('khrismir_returns', JSON.stringify(r)) }

  const processReturn = (e: React.FormEvent) => {
    e.preventDefault()
    if (!modal || !reason) return
    if (returnedIds.has(modal.id)) { toast.error('Esta encomenda já foi devolvida'); return }
    const ret: Return = {
      id: Date.now().toString(),
      order_id: modal.id,
      order_number: modal.order_number,
      customer_name: modal.customer_name,
      items: modal.items.map(i => ({ product_name: i.product_name, quantity: i.quantity, amount: i.total_price })),
      total: modal.total,
      reason,
      created_at: new Date().toISOString(),
    }
    persist([ret, ...returns])
    const updatedProducts = products.map(p => {
      const item = modal.items.find(i => i.product_id === p.id)
      return item ? { ...p, stock_quantity: p.stock_quantity + item.quantity } : p
    })
    setProducts(updatedProducts)
    localStorage.setItem('khrismir_products', JSON.stringify(updatedProducts))
    syncProducts(updatedProducts)   // ← actualiza stock no Supabase (devolução repõe stock)
    const cfMovements = JSON.parse(localStorage.getItem('cf_movements') || '[]')
    cfMovements.unshift({ id: Date.now().toString(), date: new Date().toISOString().slice(0, 10), type: 'expense', description: `Devolução ${modal.order_number}${modal.customer_name ? ' — ' + modal.customer_name : ''}`, amount: modal.total, category: 'Devoluções', account: '', reference: modal.order_number, created_at: new Date().toISOString() })
    localStorage.setItem('cf_movements', JSON.stringify(cfMovements))
    setOrders(orders.map(o => o.id === modal.id ? { ...o, status: 'cancelado' as any } : o))
    toast.success(`Devolução de ${modal.order_number} processada!`)
    setModal(null)
    setReason('')
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2"><RotateCcw className="w-5 h-5 text-orange-500" /> Encomendas Entregues</h3>
          {deliveredOrders.length === 0 ? <p className="text-center text-gray-400 py-8">Sem encomendas entregues</p> : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {deliveredOrders.map(o => {
                const alreadyReturned = returnedIds.has(o.id)
                return (
                  <div key={o.id} className={`border rounded-xl p-3 ${alreadyReturned ? 'opacity-50 bg-gray-50' : 'border-gray-100'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-sm">{o.order_number}</p>
                        <p className="text-xs text-gray-500">{o.customer_name || 'POS'} • {new Date(o.created_at).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="text-xs font-bold text-cyan-600">{o.total.toLocaleString()} AOA</p>
                      </div>
                      {alreadyReturned ? <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">Devolvida</span> : (
                        <button onClick={() => { setModal(o); setReason('') }} className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 font-medium">Devolver</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="font-bold mb-4">Histórico de Devoluções</h3>
          {returns.length === 0 ? <p className="text-center text-gray-400 py-8">Sem devoluções registadas</p> : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {returns.map(r => (
                <div key={r.id} className="border border-orange-100 bg-orange-50 rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-sm text-orange-800">{r.order_number}</p>
                      <p className="text-xs text-orange-600">{r.customer_name || 'POS'}</p>
                      <p className="text-xs text-gray-500 mt-1">Motivo: {r.reason}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">-{r.total.toLocaleString()} AOA</p>
                      <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('pt-AO')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-2">Processar Devolução</h3>
            <p className="text-sm text-gray-500 mb-4">{modal.order_number} — {modal.total.toLocaleString()} AOA</p>
            <form onSubmit={processReturn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Motivo da Devolução *</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={3} placeholder="Ex: Produto em mau estado..." className="w-full border p-3 rounded-xl resize-none" />
              </div>
              <div className="bg-amber-50 p-3 rounded-xl text-xs text-amber-700">Irá: restituir stock, registar movimento negativo no caixa e cancelar a encomenda.</div>
              <button type="submit" className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition">Confirmar Devolução</button>
              <button type="button" onClick={() => setModal(null)} className="w-full text-gray-400 text-sm hover:text-gray-600">Cancelar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── FIDELIZAÇÃO ─── */
function LoyaltyTab({ orders }: { orders: Order[] }) {
  const POINTS_VALUE = 1
  const clients: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]').filter((c: any) => c.role === 'client')
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>(() => { try { return JSON.parse(localStorage.getItem('khrismir_loyalty') || '[]') } catch { return [] } })
  const [redeemModal, setRedeemModal] = useState<any>(null)
  const [redeemPoints, setRedeemPoints] = useState('')

  const getClientPoints = (clientId: string) =>
    transactions.filter(t => t.client_id === clientId).reduce((sum, t) => t.type === 'earned' ? sum + t.points : sum - t.points, 0)

  const clientsWithPoints = clients.map(c => {
    const clientOrders = orders.filter(o => o.customer_id === c.id && o.status === 'entregue')
    const totalSpent = clientOrders.reduce((s: number, o: any) => s + o.total, 0)
    return { ...c, totalSpent, currentPoints: getClientPoints(c.id), orderCount: clientOrders.length }
  }).filter(c => c.orderCount > 0).sort((a, b) => b.currentPoints - a.currentPoints)

  const handleRedeem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!redeemModal) return
    const pts = Number(redeemPoints)
    if (pts <= 0 || pts > redeemModal.currentPoints) { toast.error('Pontos inválidos'); return }
    const trans: LoyaltyTransaction = { id: Date.now().toString(), client_id: redeemModal.id, client_name: redeemModal.full_name, points: pts, type: 'redeemed', created_at: new Date().toISOString() }
    const updated = [...transactions, trans]
    setTransactions(updated)
    localStorage.setItem('khrismir_loyalty', JSON.stringify(updated))
    toast.success(`${pts} pontos resgatados = ${(pts * POINTS_VALUE).toLocaleString()} AOA desconto`)
    setRedeemModal(null)
    setRedeemPoints('')
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-yellow-400 to-amber-500 text-white p-5 rounded-2xl shadow-lg">
          <p className="opacity-80 text-xs font-medium uppercase">Clientes no Programa</p>
          <h3 className="text-2xl font-black mt-1">{clientsWithPoints.length}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-gray-400 text-xs font-medium uppercase">Regra de Pontos</p>
          <h3 className="text-sm font-bold mt-1 text-gray-800">1 ponto por cada 1.000 AOA gastos</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-gray-400 text-xs font-medium uppercase">Valor do Ponto</p>
          <h3 className="text-sm font-bold mt-1 text-gray-800">1 ponto = 1 AOA desconto</h3>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500" /> Clientes — Saldo de Pontos</h3>
        {clientsWithPoints.length === 0 ? <p className="text-center text-gray-400 py-8">Nenhum cliente com pedidos entregues</p> : (
          <div className="space-y-3">
            {clientsWithPoints.map(c => (
              <div key={c.id} className="border border-gray-100 rounded-2xl p-4 flex justify-between items-center flex-wrap gap-3">
                <div>
                  <p className="font-bold text-gray-800">{c.full_name}</p>
                  <p className="text-xs text-gray-500">{c.email} • {c.orderCount} pedidos • {c.totalSpent.toLocaleString()} AOA</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-black text-yellow-500">{c.currentPoints}</p>
                    <p className="text-xs text-gray-400">pontos</p>
                  </div>
                  <button onClick={() => { setRedeemModal(c); setRedeemPoints('') }} disabled={c.currentPoints <= 0}
                    className="bg-yellow-400 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed">
                    Resgatar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {redeemModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold mb-1">Resgatar Pontos</h3>
            <p className="text-sm text-gray-500 mb-4">{redeemModal.full_name} — {redeemModal.currentPoints} pontos disponíveis</p>
            <form onSubmit={handleRedeem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Pontos a resgatar</label>
                <input type="number" value={redeemPoints} onChange={e => setRedeemPoints(e.target.value)} min="1" max={redeemModal.currentPoints} required className="w-full border p-3 rounded-xl" />
                {redeemPoints && <p className="text-xs text-green-600 mt-1">= {(Number(redeemPoints) * POINTS_VALUE).toLocaleString()} AOA desconto</p>}
              </div>
              <button type="submit" className="w-full bg-yellow-400 text-white py-3 rounded-xl font-bold hover:bg-yellow-500 transition">Confirmar Resgate</button>
              <button type="button" onClick={() => setRedeemModal(null)} className="w-full text-gray-400 text-sm hover:text-gray-600">Cancelar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── CALENDÁRIO DE ENTREGAS ─── */
function CalendarTab({ orders }: { orders: Order[] }) {
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)

  const deliveryOrders = orders.filter(o => o.delivery_type === 'delivery' && o.status !== 'cancelado')
  const ordersOnDate = deliveryOrders.filter(o => o.created_at.slice(0, 10) === selectedDate)

  const daysWithOrders: Record<string, number> = {}
  deliveryOrders.forEach(o => {
    const d = o.created_at.slice(0, 10)
    daysWithOrders[d] = (daysWithOrders[d] || 0) + 1
  })

  const [year, month] = selectedDate.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const calDays = (Array.from({ length: firstDay }, () => null) as (number | null)[]).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1))

  const prevMonth = () => { const d = new Date(year, month - 2, 1); setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`) }
  const nextMonth = () => { const d = new Date(year, month, 1); setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`) }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <button onClick={prevMonth} className="text-gray-400 hover:text-gray-700 px-3 py-1 rounded hover:bg-gray-100">&lt;</button>
          <h3 className="font-bold text-gray-800">{new Date(year, month - 1).toLocaleDateString('pt-AO', { month: 'long', year: 'numeric' })}</h3>
          <button onClick={nextMonth} className="text-gray-400 hover:text-gray-700 px-3 py-1 rounded hover:bg-gray-100">&gt;</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => <div key={d} className="text-xs text-gray-400 font-medium py-1">{d}</div>)}
          {calDays.map((day, i) => {
            if (!day) return <div key={i} />
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const count = daysWithOrders[dateStr] || 0
            const isSelected = dateStr === selectedDate
            const isToday = dateStr === today
            return (
              <button key={i} onClick={() => setSelectedDate(dateStr)}
                className={`relative py-2 rounded-lg text-sm font-medium transition ${isSelected ? 'bg-cyan-600 text-white' : isToday ? 'border-2 border-cyan-300 text-cyan-700' : 'hover:bg-gray-100 text-gray-700'}`}>
                {day}
                {count > 0 && <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold ${isSelected ? 'bg-white text-cyan-700' : 'bg-cyan-600 text-white'}`}>{count}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-cyan-600" />
          Entregas em {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-AO', { day: 'numeric', month: 'long' })}
        </h3>
        {ordersOnDate.length === 0 ? <p className="text-center text-gray-400 py-8">Sem entregas neste dia</p> : (
          <div className="space-y-3">
            {ordersOnDate.map(o => (
              <div key={o.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-sm">{o.order_number}</p>
                    <p className="text-xs text-gray-600">{o.customer_name || 'Cliente'}</p>
                    {o.delivery_address && <p className="text-xs text-gray-400">📍 {o.delivery_address}</p>}
                    {o.customer_phone && <p className="text-xs text-gray-400">📞 {o.customer_phone}</p>}
                    {o.delivery_zone && <p className="text-xs text-gray-400">Zona: {o.delivery_zone}</p>}
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${statusConfig[o.status as OrderStatus]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {statusConfig[o.status as OrderStatus]?.label || o.status}
                    </span>
                    <p className="text-xs font-bold text-cyan-600 mt-1">{o.total.toLocaleString()} AOA</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── GESTÃO DE LOJAS (super_admin) ─── */
interface StoreForm {
  id?: string; name: string; slug: string; address: string; phone: string
  email: string; whatsapp: string; nif: string; iva_rate: string; active: boolean
}
const EMPTY_STORE_FORM: StoreForm = {
  name: '', slug: '', address: '', phone: '', email: '', whatsapp: '', nif: '', iva_rate: '14', active: true,
}

function StoresTab() {
  const [stores, setStores]       = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState<StoreForm>(EMPTY_STORE_FORM)
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')

  const loadStores = async () => {
    setLoading(true)
    if (!isSupabaseReady() || !supabase) {
      const local: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_stores') || '[]') } catch { return [] } })()
      setStores(local); setLoading(false); return
    }
    const { data } = await supabase.from('stores').select('*').order('name')
    if (data) { setStores(data); localStorage.setItem('khrismir_stores', JSON.stringify(data)) }
    setLoading(false)
  }

  useEffect(() => {
    loadStores()
    const handleSync = (e: Event) => {
      const t = (e as CustomEvent).detail?.table
      if (!t || t === 'stores') loadStores()
    }
    window.addEventListener('khrismir:sync', handleSync)
    return () => window.removeEventListener('khrismir:sync', handleSync)
  }, [])

  const openNew  = () => { setForm(EMPTY_STORE_FORM); setShowModal(true) }
  const openEdit = (s: any) => {
    setForm({ id: s.id, name: s.name ?? '', slug: s.slug ?? '', address: s.address ?? '',
      phone: s.phone ?? '', email: s.email ?? '', whatsapp: s.whatsapp ?? '',
      nif: s.nif ?? '', iva_rate: String(s.iva_rate ?? 14), active: s.active !== false })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome da loja é obrigatório'); return }
    setSaving(true)
    const result = await syncStore({
      id: form.id, name: form.name.trim(),
      slug: form.slug.trim() || form.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      address: form.address, phone: form.phone, email: form.email, whatsapp: form.whatsapp,
      nif: form.nif, iva_rate: parseFloat(form.iva_rate) || 14, active: form.active,
    })
    setSaving(false)
    if (!result) { toast.error('Erro ao guardar loja'); return }
    toast.success(form.id ? 'Loja actualizada!' : `Loja "${form.name}" criada!`)
    setShowModal(false); loadStores()
  }

  const handleToggleActive = async (s: any) => {
    if (!confirm(s.active ? `Desactivar "${s.name}"?` : `Activar "${s.name}"?`)) return
    await syncStore({ ...s, active: !s.active })
    toast.success(s.active ? 'Loja desactivada' : 'Loja activada')
    loadStores()
  }

  const handleDelete = async (s: any) => {
    const confirmMsg = `⚠️ ATENÇÃO: Apagar "${s.name}" permanentemente?\n\nEsta acção é irreversível. Os dados (produtos, encomendas, movimentos) associados a esta loja permanecem no Supabase mas a loja deixa de existir.\n\nEscreva o nome da loja para confirmar:`
    const typed = prompt(confirmMsg)
    if (typed === null) return                        // cancelou
    if (typed.trim() !== s.name.trim()) {
      toast.error('Nome não coincide — operação cancelada')
      return
    }
    const { ok, error } = await deleteStorePermanent(s.id)
    if (!ok) { toast.error(`Erro ao apagar: ${error}`); return }
    // Remove do localStorage também
    const local: any[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_stores') || '[]') } catch { return [] } })()
    localStorage.setItem('khrismir_stores', JSON.stringify(local.filter((x: any) => x.id !== s.id)))
    toast.success(`Loja "${s.name}" apagada`)
    loadStores()
  }

  const fld = (k: keyof StoreForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const filtered = stores.filter(s =>
    (s.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.nif ?? '').includes(search) ||
    (s.address ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const fields: { label: string; key: keyof StoreForm; placeholder: string }[] = [
    { label: 'Nome da Loja *', key: 'name',     placeholder: 'Ex: Peixaria Central' },
    { label: 'Slug (URL)',     key: 'slug',     placeholder: 'peixaria-central'      },
    { label: 'Morada',        key: 'address',  placeholder: 'Rua, Cidade'           },
    { label: 'Telefone',      key: 'phone',    placeholder: '+244 9XX XXX XXX'      },
    { label: 'Email',         key: 'email',    placeholder: 'loja@exemplo.ao'       },
    { label: 'WhatsApp',      key: 'whatsapp', placeholder: '244900000000'          },
    { label: 'NIF',           key: 'nif',      placeholder: '5001234567'            },
    { label: 'Taxa IVA (%)',  key: 'iva_rate', placeholder: '14'                    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Gestão de Lojas</h3>
          <p className="text-gray-500 text-sm mt-0.5">{stores.length} loja{stores.length !== 1 ? 's' : ''} registada{stores.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md transition">
          <Plus className="w-5 h-5" /> Nova Loja
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar por nome, NIF ou morada…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Store className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p className="font-medium">{search ? 'Nenhuma loja encontrada' : 'Sem lojas registadas'}</p>
          {!search && <button onClick={openNew} className="mt-4 text-cyan-600 hover:underline text-sm font-medium">Criar primeira loja →</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => (
            <div key={s.id} className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition ${!s.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-cyan-100 flex items-center justify-center">
                    <span className="text-xl font-bold text-cyan-600">{(s.name ?? '?').charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">{s.name}</p>
                    {s.nif && <p className="text-xs text-gray-400">NIF: {s.nif}</p>}
                  </div>
                </div>
                <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {s.active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <div className="space-y-1 text-xs text-gray-500">
                {s.address && <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3 flex-shrink-0" />{s.address}</p>}
                {s.phone   && <p className="flex items-center gap-1.5"><Building2 className="w-3 h-3 flex-shrink-0" />{s.phone}</p>}
                {s.email   && <p className="truncate">{s.email}</p>}
                <p className="text-gray-400">IVA: {s.iva_rate ?? 14}%</p>
              </div>
              <div className="flex gap-2 mt-auto pt-3 border-t border-gray-100">
                <button onClick={() => openEdit(s)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-gray-50 hover:bg-cyan-50 hover:text-cyan-700 text-gray-600 py-2 rounded-lg transition">
                  <Edit className="w-3.5 h-3.5" /> Editar
                </button>
                <button onClick={() => handleToggleActive(s)} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition ${s.active ? 'bg-amber-50 hover:bg-amber-100 text-amber-600' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}>
                  {s.active ? <><XCircle className="w-3.5 h-3.5" /> Desactivar</> : <><CheckCircle className="w-3.5 h-3.5" /> Activar</>}
                </button>
                <button onClick={() => handleDelete(s)} title="Apagar loja permanentemente"
                  className="flex items-center justify-center gap-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-cyan-600" />
                {form.id ? 'Editar Loja' : 'Nova Loja'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {fields.map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type="text" value={form[key] as string} onChange={fld(key)} placeholder={placeholder}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none" />
                </div>
              ))}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={form.active} onChange={fld('active')} className="w-4 h-4 rounded accent-cyan-600" />
                <span className="text-sm font-medium text-gray-700">Loja activa (visível para utilizadores)</span>
              </label>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'A guardar…' : 'Guardar Loja'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
