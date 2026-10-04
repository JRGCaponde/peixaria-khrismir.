import { useState, useEffect, useRef } from 'react'
import { Search, Trash2, X, Printer, Receipt, Tag, ShoppingBag, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { Product, Category, CartItem, Order, OrderStatus, PaymentType, PreparationType, PromoCode, PaymentSplitEntry } from '../types/database'
import { getSettings } from '../lib/settings'
import { printInvoice, printBusinessInvoice } from '../utils/invoice'
import { printReceipt } from '../utils/receipt'
import { registerSaleMovement, registerCreditSale, registerSplitSaleMovement } from '../lib/cashflow'
import { getOpenShift } from './_TurnoTab'
import { useAuthStore } from '../stores/useAuthStore'
import { calcOrderHash } from '../utils/saft'
import { pullAll, syncOrderStatus, syncOrder, syncProductStock, syncCashFlow, syncLoyalty, syncPromos } from '../lib/sync'
import { notifyDataChange } from '../lib/realtime'
import { isSupabaseReady } from '../lib/supabase'
import { maybeQueueForAGT } from '../lib/agt'

// Sem dados fictícios — carrega apenas do localStorage / Supabase
const initialCategories: Category[] = []
const initialProducts: Product[] = []

interface POSCartItem extends CartItem {
  weight: number
  total_price: number
}

export default function POS() {
  const settings = getSettings()
  const { user } = useAuthStore()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [cart, setCart] = useState<POSCartItem[]>([])
  const [paymentType, setPaymentType] = useState<PaymentType>('multicaixa')
  const [isCredit, setIsCredit] = useState(false)
  const [creditCustomerName, setCreditCustomerName] = useState('')
  const [isSplit, setIsSplit] = useState(false)
  const [splitPayments, setSplitPayments] = useState<PaymentSplitEntry[]>([
    { method: 'dinheiro', amount: 0 },
    { method: 'multicaixa', amount: 0 },
  ])
  const [selectedBank, setSelectedBank] = useState('')
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string }[]>([])
  const [showWeightDialog, setShowWeightDialog] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [weight, setWeight] = useState(1.0)
  const [preparation, setPreparation] = useState<PreparationType>('inteiro')
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastOrder, setLastOrder] = useState<Order | null>(null)
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null)
  const [activeTab, setActiveTab] = useState<'pos' | 'orders'>('pos')
  const [orders, setOrders] = useState<Order[]>([])
  const [orderFilter, setOrderFilter] = useState<OrderStatus | 'all'>('all')
  const [showLowStock, setShowLowStock] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const tryParse = (key: string, fallback: any) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
    const loadLocal = () => {
      setProducts(tryParse('khrismir_products', initialProducts))
      setCategories(tryParse('khrismir_categories', initialCategories))
      setCart(tryParse('khrismir_pos_cart', []))
      setOrders(tryParse('khrismir_orders', []))
      const banks: { id: string; name: string; type: string }[] = tryParse('cf_accounts', [])
      const bankList = banks.filter(a => a.type === 'bank')
      setBankAccounts(bankList)
      if (bankList.length > 0) setSelectedBank(bankList[0].name)
    }
    loadLocal()

    // Sincroniza com Supabase na abertura
    const syncAndLoad = async () => {
      if (!isSupabaseReady()) return
      await pullAll()
      loadLocal()
    }
    syncAndLoad()

    // Realtime global (realtime.ts): recarrega quando produtos, categorias ou encomendas mudam
    const handleSync = (e: Event) => {
      const table = (e as CustomEvent).detail?.table
      if (!table || ['products', 'categories', 'orders', 'promo_codes'].includes(table)) {
        loadLocal()
      }
    }
    window.addEventListener('khrismir:sync', handleSync)

    // Fallback: re-sync a cada 2 minutos (caso WebSocket caia)
    const interval = setInterval(() => {
      if (isSupabaseReady()) pullAll().then(loadLocal)
    }, 120000)

    return () => {
      window.removeEventListener('khrismir:sync', handleSync)
      clearInterval(interval)
    }
  }, [])

  // Preço efectivo com desconto
  const effectivePrice = (p: Product) => p.discount ? Math.round(p.price * (1 - p.discount / 100)) : p.price

  const saveCart = (newCart: POSCartItem[]) => {
    setCart(newCart)
    localStorage.setItem('khrismir_pos_cart', JSON.stringify(newCart))
  }

  const filteredProducts = products.filter(p => {
    const q = search.toLowerCase()
    const matchesSearch = p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory
    return matchesSearch && matchesCategory && p.stock_quantity > 0
  })

  const lowStockProducts = products.filter(p => p.stock_quantity <= p.min_stock)
  const isBrowsing = search.trim().length > 0 || selectedCategory !== ''

  const openWeightDialog = (product: Product) => {
    setSelectedProduct(product)
    setWeight(1.0)
    const prepOptions: PreparationType[] = []
    if (product.allow_whole) prepOptions.push('inteiro')
    if (product.allow_clean) prepOptions.push('limpo')
    if (product.allow_fillet) prepOptions.push('filé')
    if (product.allow_steak) prepOptions.push('posta')
    setPreparation(prepOptions[0])
    setShowWeightDialog(true)
  }

  // Leitor de código de barras USB (emula teclado): dígitos digitados muito
  // depressa seguidos de Enter. Se o intervalo entre teclas ultrapassar
  // SCAN_MAX_GAP_MS, assume-se escrita humana normal e o buffer é limpo —
  // por isso só actua sobre sequências rápidas, nunca sobre digitação manual.
  useEffect(() => {
    if (activeTab !== 'pos') return
    let buffer = ''
    let lastTime = 0
    const SCAN_MAX_GAP_MS = 50
    const MIN_BARCODE_LENGTH = 4

    const handleScannerInput = (e: KeyboardEvent) => {
      const now = Date.now()
      if (now - lastTime > SCAN_MAX_GAP_MS) buffer = ''
      lastTime = now

      if (e.key === 'Enter') {
        const code = buffer.trim()
        buffer = ''
        if (code.length < MIN_BARCODE_LENGTH) return
        const match = products.find(p => p.barcode && p.barcode === code)
        if (!match) return
        e.preventDefault()
        if (match.stock_quantity <= 0) {
          toast.error(`${match.name} sem stock`)
          return
        }
        openWeightDialog(match)
        toast.success(`📷 ${match.name}`)
        return
      }
      if (e.key.length === 1) buffer += e.key
    }

    window.addEventListener('keydown', handleScannerInput)
    return () => window.removeEventListener('keydown', handleScannerInput)
  }, [products, activeTab])

  const addToCart = () => {
    if (!selectedProduct) return

    // Verificar stock disponível (descontar o que já está no carrinho)
    const alreadyInCart = cart
      .filter(c => c.id === selectedProduct.id)
      .reduce((sum, c) => sum + c.weight * c.quantity, 0)
    const remaining = selectedProduct.stock_quantity - alreadyInCart

    if (weight > remaining) {
      toast.error(`Stock insuficiente! Disponível: ${remaining.toFixed(1)} kg`)
      return
    }

    const unitPrice = effectivePrice(selectedProduct)
    const total = unitPrice * weight
    const existing = cart.find(c => c.id === selectedProduct.id && c.preparation === preparation && c.weight === weight)
    if (existing) {
      saveCart(cart.map(c => c.id === selectedProduct.id && c.preparation === preparation && c.weight === weight ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      saveCart([...cart, { ...selectedProduct, price: unitPrice, quantity: 1, weight, preparation, total_price: total } as POSCartItem])
    }
    setShowWeightDialog(false)
    toast.success(`${selectedProduct.name} adicionado!`)
    searchInputRef.current?.focus()
  }

  const removeFromCart = (idx: number) => {
    saveCart(cart.filter((_, i) => i !== idx))
  }

  const updateQuantity = (idx: number, delta: number) => {
    const newCart = [...cart]
    const item = newCart[idx]
    const newQty = Math.max(1, item.quantity + delta)

    // Verifica stock disponível (exclui o item actual do cálculo)
    if (delta > 0) {
      const otherInCart = cart
        .filter((c, i) => i !== idx && c.id === item.id)
        .reduce((sum, c) => sum + c.weight * c.quantity, 0)
      const product = products.find(p => p.id === item.id)
      const stockAvail = (product?.stock_quantity ?? 0) - otherInCart
      if (item.weight * newQty > stockAvail) {
        toast.error(`Stock insuficiente! Disponível: ${(stockAvail / item.weight).toFixed(0)} unidade(s)`)
        return
      }
    }

    newCart[idx] = { ...item, quantity: newQty, total_price: item.weight * item.price * newQty }
    saveCart(newCart)
  }

  const cartSubtotal = cart.reduce((sum, c) => sum + c.weight * (c.price ?? 0) * c.quantity, 0)
  const discountAmount = appliedPromo
    ? appliedPromo.discount_type === 'percentage' ? Math.round(cartSubtotal * appliedPromo.discount_value / 100) : appliedPromo.discount_value
    : 0
  const cartTotal = cartSubtotal - discountAmount

  const applyPromo = () => {
    const promos: PromoCode[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_promos') || '[]') } catch { return [] } })()
    const code = promos.find(p => p.code === promoInput.toUpperCase() && p.active)
    if (!code) { toast.error('Código inválido ou inactivo'); return }
    if (code.max_uses && code.uses >= code.max_uses) { toast.error('Código esgotado'); return }
    if (code.expires_at && new Date(code.expires_at) < new Date()) { toast.error('Código expirado'); return }
    if (cartSubtotal < code.min_order) { toast.error(`Pedido mínimo: ${code.min_order.toLocaleString()} Kz`); return }
    setAppliedPromo(code); toast.success(`Desconto ${code.discount_type === 'percentage' ? code.discount_value + '%' : code.discount_value.toLocaleString() + ' Kz'} aplicado!`)
  }

  const handleCheckout = () => {
    if (cart.length === 0) { toast.error('Carrinho vazio'); return }

    const openShift = getOpenShift(user?.id)
    if (!openShift) {
      toast.warning('Abra o seu turno antes de processar vendas. Vá a Caixa → Turno.')
      return
    }
    if (isCredit && !creditCustomerName.trim()) {
      toast.warning('Indique o nome do cliente para a venda a fiado.')
      return
    }
    const validSplits = splitPayments.filter(s => s.amount > 0)
    if (isSplit) {
      const splitSum = Math.round(validSplits.reduce((s, p) => s + p.amount, 0) * 100) / 100
      if (validSplits.length < 2) { toast.warning('Indique pelo menos dois valores para dividir o pagamento.'); return }
      if (Math.abs(splitSum - cartTotal) > 0.5) {
        toast.warning(`A soma dos pagamentos (${splitSum.toLocaleString('pt-AO')} Kz) não bate com o total (${cartTotal.toLocaleString('pt-AO')} Kz).`)
        return
      }
    }

    const orderNumber = (() => {
      try {
        const counter = JSON.parse(localStorage.getItem('khrismir_invoice_counter') || 'null')
        if (counter?.next && counter?.year) {
          const year = new Date().getFullYear()
          const seq = counter.year === year ? counter.next : 1
          const newCounter = { year, next: seq + 1 }
          localStorage.setItem('khrismir_invoice_counter', JSON.stringify(newCounter))
          return `${year}/${String(seq).padStart(3, '0')}`
        }
      } catch { /* sem contador, usa fallback */ }
      return `PKH-${Math.floor(10000 + Math.random() * 90000)}`
    })()
    const orderId = crypto.randomUUID()

    const orderBase = {
      id: orderId,
      order_number: orderNumber,
      status: 'pronto' as const,
      payment_type: isSplit ? ('misto' as const) : paymentType,
      payment_split: isSplit ? validSplits : undefined,
      delivery_type: 'retirada' as const,
      customer_name: isCredit ? creditCustomerName.trim() : undefined,
      payment_status: (isCredit ? 'pendente' : 'pago') as 'pago' | 'pendente',
      subtotal: cartSubtotal,
      discount_code: appliedPromo?.code,
      discount_amount: discountAmount || undefined,
      total: cartTotal,
      items: cart.map((c, _i) => ({
        id: crypto.randomUUID(),
        order_id: orderId,
        product_id: c.id,
        product_name: c.name,
        quantity: c.weight * c.quantity,
        unit_price: c.price,
        preparation: c.preparation,
        total_price: c.weight * c.price * c.quantity,
      })),
      created_at: new Date().toISOString(),
    }

    const newOrder: Order = { ...orderBase, hash: calcOrderHash(orderBase) }

    const orders = JSON.parse(localStorage.getItem('khrismir_orders') || '[]')
    orders.unshift(newOrder)
    localStorage.setItem('khrismir_orders', JSON.stringify(orders))

    // Sem credenciais AGT configuradas → não faz nada (ver src/lib/agt.ts)
    maybeQueueForAGT(newOrder, settings).catch(() => {})

    const storedProducts = JSON.parse(localStorage.getItem('khrismir_products') || '[]')
    cart.forEach(cartItem => {
      const idx = storedProducts.findIndex((p: Product) => p.id === cartItem.id)
      if (idx !== -1) storedProducts[idx].stock_quantity = Math.max(0, storedProducts[idx].stock_quantity - cartItem.weight * cartItem.quantity)
    })
    localStorage.setItem('khrismir_products', JSON.stringify(storedProducts))
    // Actualiza o estado React imediatamente para reflectir o novo stock na UI
    setProducts(storedProducts)

    if (isCredit) {
      registerCreditSale(orderId, orderNumber, cartTotal)
    } else if (isSplit) {
      registerSplitSaleMovement(
        validSplits.map(s => ({ method: s.method, amount: s.amount, account: s.method === 'multicaixa' ? selectedBank : undefined })),
        orderNumber, orderId,
      )
    } else {
      const bankAccount = paymentType === 'multicaixa' ? selectedBank : undefined
      registerSaleMovement(cartTotal, orderNumber, paymentType, orderId, bankAccount)
    }

    if (newOrder.customer_id) {
      const loyaltyTx = { id: crypto.randomUUID(), client_id: newOrder.customer_id, client_name: newOrder.customer_name || '', points: Math.floor(cartTotal / 1000), type: 'earned', order_id: newOrder.id, created_at: new Date().toISOString() }
      const loyalty = JSON.parse(localStorage.getItem('khrismir_loyalty') || '[]')
      loyalty.push(loyaltyTx)
      localStorage.setItem('khrismir_loyalty', JSON.stringify(loyalty))
      syncLoyalty([loyaltyTx])
    }

    if (appliedPromo) {
      const promos: PromoCode[] = JSON.parse(localStorage.getItem('khrismir_promos') || '[]')
      const pi = promos.findIndex(p => p.id === appliedPromo.id)
      if (pi !== -1) { promos[pi].uses += 1; localStorage.setItem('khrismir_promos', JSON.stringify(promos)); syncPromos(promos) }
    }

    saveCart([])
    setAppliedPromo(null)
    setPromoInput('')
    setIsCredit(false)
    setCreditCustomerName('')
    setIsSplit(false)
    setSplitPayments([{ method: 'dinheiro', amount: 0 }, { method: 'multicaixa', amount: 0 }])
    setLastOrder(newOrder)
    setShowReceipt(true)
    toast.success(`Venda ${orderNumber} concluída!`)

    // ── Sync imediato para Supabase → todos os dispositivos recebem em < 1s ──
    syncOrder(newOrder)                       // encomenda + itens
    // Decrementa stock atomicamente por produto (evita race conditions com Realtime echo)
    ;(async () => {
      for (const cartItem of cart) {
        await syncProductStock(cartItem.id, cartItem.weight * cartItem.quantity)
      }
      notifyDataChange('products')           // UI atualiza com stock autoritativo do servidor
    })()
    const cf = JSON.parse(localStorage.getItem('khrismir_cashflow') || '[]')
    syncCashFlow(cf)                          // movimento de caixa
    // Notifica os outros componentes neste dispositivo também
    notifyDataChange('orders')

    // Impressão automática: fatura AGT se NIF do cliente, talão simples caso contrário
    if (newOrder.customer_nif) {
      printBusinessInvoice(newOrder, settings)
    } else {
      printReceipt(newOrder, settings)
    }
  }

  // ── helpers de encomendas ───────────────────────────────────
  const statusCfg: Record<string, { label: string; color: string; next?: OrderStatus }> = {
    pendente:   { label: 'Pendente',    color: 'bg-yellow-100 text-yellow-700', next: 'confirmado' },
    confirmado: { label: 'Confirmado',  color: 'bg-blue-100 text-blue-700',    next: 'pronto'     },
    pronto:     { label: 'Pronto',      color: 'bg-purple-100 text-purple-700',next: 'entregue'   },
    entregue:   { label: 'Entregue',    color: 'bg-green-100 text-green-700'                      },
    cancelado:  { label: 'Cancelado',   color: 'bg-red-100 text-red-600'                          },
  }
  const filteredOrders = orders
    .filter(o => orderFilter === 'all' || o.status === orderFilter)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const advanceOrder = (id: string, next: OrderStatus) => {
    const updated = orders.map(o => o.id === id ? { ...o, status: next, updated_at: new Date().toISOString() } : o)
    setOrders(updated); localStorage.setItem('khrismir_orders', JSON.stringify(updated))
    syncOrderStatus(id, next); toast.success(`Estado: ${statusCfg[next].label}`)
  }

  const pendingCount = orders.filter(o => o.status === 'pendente').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Ponto de Venda</h2>
        <p className="text-gray-500 text-sm">Registo de vendas e encomendas</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-0">
        <button onClick={() => setActiveTab('pos')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition -mb-px ${activeTab === 'pos' ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <Receipt className="w-4 h-4" /> Caixa (POS)
        </button>
        <button onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition -mb-px ${activeTab === 'orders' ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <ShoppingBag className="w-4 h-4" /> Encomendas
          {pendingCount > 0 && <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{pendingCount}</span>}
        </button>
      </div>

      {/* ════ TAB: ENCOMENDAS ════ */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'pendente', 'confirmado', 'pronto', 'entregue', 'cancelado'] as const).map(s => (
              <button key={s} onClick={() => setOrderFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${orderFilter === s ? 'bg-cyan-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>
                {s === 'all' ? 'Todos' : statusCfg[s]?.label}
                {s === 'pendente' && pendingCount > 0 && <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1">{pendingCount}</span>}
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
              <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Nenhuma encomenda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map(order => (
                <div key={order.id} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-bold text-base">{order.order_number}</h4>
                      <p className="text-sm text-gray-500">{order.customer_name || 'Venda POS'}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {new Date(order.created_at).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusCfg[order.status]?.color}`}>{statusCfg[order.status]?.label}</span>
                      <p className="font-bold text-cyan-600 text-sm mt-1">{order.total.toLocaleString()} AOA</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1 mb-3">
                    {order.items?.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-gray-600">
                        <span>{item.product_name} ({item.preparation}) × {Number(item.quantity).toFixed(2)}kg</span>
                        <span>{Number(item.total_price).toLocaleString()} AOA</span>
                      </div>
                    ))}
                  </div>
                  {statusCfg[order.status]?.next && (
                    <button onClick={() => advanceOrder(order.id, statusCfg[order.status].next!)}
                      className="w-full bg-cyan-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-cyan-700 transition">
                      → {statusCfg[statusCfg[order.status].next!]?.label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════ TAB: POS ════ */}
      {activeTab === 'pos' && <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-200px)]">
      {/* Products Grid */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Search & Filter */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar produtos ou ler código de barras..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">Todas</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Alerta de Stock Baixo */}
        {lowStockProducts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl mb-4">
            <button
              onClick={() => setShowLowStock(v => !v)}
              className="w-full flex items-center justify-between p-3 text-left"
            >
              <span className="flex items-center gap-2 text-red-700 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                {lowStockProducts.length} produto{lowStockProducts.length > 1 ? 's' : ''} com stock baixo
              </span>
              <span className="text-red-500 text-xs">{showLowStock ? 'Esconder' : 'Ver'}</span>
            </button>
            {showLowStock && (
              <div className="px-3 pb-3 space-y-1">
                {lowStockProducts.map(p => (
                  <div key={p.id} className="flex justify-between text-xs text-red-700 bg-white rounded-lg px-3 py-2">
                    <span>{p.name}</span>
                    <span className="font-bold">{p.stock_quantity} / mín. {p.min_stock} {p.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Products — tabela estilo documento (inspirada no editor de vendas PRIMAVERA).
            Fica oculta por omissão: só aparece depois de procurar por nome, ler o
            código de barras, ou escolher uma categoria — tal como o Primavera não
            mostra um catálogo, só a tabela do documento a preencher-se. */}
        {!isBrowsing ? (
          <div className="flex-1 rounded-xl shadow-lg bg-white border border-gray-200 flex flex-col items-center justify-center text-center p-10 text-gray-400">
            <Search className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-medium">Procure um produto por nome, leia o código de barras, ou escolha uma categoria</p>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto rounded-xl shadow-lg bg-white border border-gray-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-200 z-10">
              <tr>
                <th className="text-left p-3">Artigo</th>
                <th className="text-left p-3 hidden md:table-cell">Cód. Barras</th>
                <th className="text-right p-3">Preço</th>
                <th className="text-right p-3 hidden sm:table-cell">Stock</th>
                <th className="p-3 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400 text-sm">Nenhum produto encontrado</td></tr>
              )}
              {filteredProducts.map((product, i) => (
                <tr
                  key={product.id}
                  onClick={() => openWeightDialog(product)}
                  className={`cursor-pointer border-b border-gray-100 hover:bg-cyan-100 transition ${i % 2 === 1 ? 'bg-cyan-50/70' : 'bg-white'} ${product.stock_quantity <= product.min_stock ? 'bg-red-50' : ''}`}
                >
                  <td className="p-3 font-semibold text-gray-800">
                    {product.name}
                    {product.stock_quantity <= product.min_stock && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold align-middle">
                        <AlertTriangle className="w-2.5 h-2.5" /> Baixo
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-gray-400 hidden md:table-cell">{product.barcode || '—'}</td>
                  <td className="p-3 text-right">
                    {product.discount ? (
                      <div>
                        <p className="text-xs text-gray-400 line-through leading-tight">{Number(product.price).toLocaleString('pt-AO')}</p>
                        <p className="text-green-600 font-bold leading-tight">{effectivePrice(product).toLocaleString('pt-AO')} <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">-{product.discount}%</span></p>
                      </div>
                    ) : (
                      <span className="text-cyan-700 font-bold">{Number(product.price).toLocaleString('pt-AO')} AOA/kg</span>
                    )}
                  </td>
                  <td className="p-3 text-right text-gray-500 hidden sm:table-cell">{product.stock_quantity}kg</td>
                  <td className="p-3 text-center">
                    <span className="inline-flex w-7 h-7 rounded-full bg-cyan-50 text-cyan-600 items-center justify-center font-bold border border-cyan-200">+</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Cart Sidebar — painel de venda estilo documento, com total em destaque */}
      <div className="lg:w-96 bg-white rounded-xl shadow-lg flex flex-col overflow-hidden border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-bold flex items-center gap-2 text-sm text-gray-500 uppercase tracking-wide">
            <Receipt className="w-4 h-4" /> Venda Atual
          </h3>
          <p className="text-4xl font-black mt-1 tracking-tight text-gray-800">
            {cartTotal.toLocaleString('pt-AO')} <span className="text-lg font-bold text-cyan-600">AOA</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Adicione produtos</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-200">
                <tr>
                  <th className="text-left p-2">Artigo</th>
                  <th className="text-right p-2">Qtd.</th>
                  <th className="text-right p-2">Total</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, idx) => (
                  <tr key={idx} className={`border-b border-gray-100 ${idx % 2 === 1 ? 'bg-cyan-50/60' : ''}`}>
                    <td className="p-2 align-top">
                      <p className="font-semibold text-gray-800">{item.name}</p>
                      <p className="text-gray-400 capitalize">{item.preparation} • {item.weight}kg</p>
                    </td>
                    <td className="p-2 align-top text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => updateQuantity(idx, -1)} className="w-6 h-6 bg-gray-200 rounded-full text-sm font-bold flex items-center justify-center shrink-0">-</button>
                        <span>{item.quantity}x</span>
                        <button onClick={() => updateQuantity(idx, 1)} className="w-6 h-6 bg-gray-200 rounded-full text-sm font-bold flex items-center justify-center shrink-0">+</button>
                      </div>
                    </td>
                    <td className="p-2 align-top text-right font-bold whitespace-nowrap">{Number(item.weight * item.price * item.quantity).toLocaleString('pt-AO')}</td>
                    <td className="p-2 align-top text-center">
                      <button onClick={() => removeFromCart(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Payment & Checkout */}
        <div className="p-4 border-t space-y-4">
          <div>
            <label className="text-sm font-medium block mb-2">Pagamento</label>
            <div className={`grid grid-cols-3 gap-2 ${isCredit || isSplit ? 'opacity-40 pointer-events-none' : ''}`}>
              {(['multicaixa', 'express', 'dinheiro'] as PaymentType[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPaymentType(p)}
                  className={`p-2 rounded-lg text-sm font-medium ${paymentType === p ? 'bg-cyan-600 text-white' : 'bg-gray-100'}`}
                >
                  {p === 'multicaixa' ? '💳' : p === 'express' ? '📱' : '💵'} {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            {!isCredit && !isSplit && paymentType === 'multicaixa' && bankAccounts.length > 0 && (
              <div className="mt-2">
                <label className="text-xs text-gray-500 font-medium block mb-1">Banco de destino</label>
                <select
                  value={selectedBank}
                  onChange={e => setSelectedBank(e.target.value)}
                  className="w-full border border-cyan-300 bg-cyan-50 p-2 rounded-lg text-sm font-medium text-cyan-800 focus:ring-2 focus:ring-cyan-500"
                >
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => setIsCredit(v => !v)}
                disabled={isSplit}
                className={`p-2 rounded-lg text-sm font-medium border-2 border-dashed disabled:opacity-40 ${isCredit ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-300'}`}
              >
                🧾 Fiado
              </button>
              <button
                onClick={() => setIsSplit(v => !v)}
                disabled={isCredit}
                className={`p-2 rounded-lg text-sm font-medium border-2 border-dashed disabled:opacity-40 ${isSplit ? 'bg-purple-500 text-white border-purple-500' : 'bg-purple-50 text-purple-700 border-purple-300'}`}
              >
                🔀 Dividir
              </button>
            </div>

            {isCredit && (
              <div className="mt-2">
                <label className="text-xs text-gray-500 font-medium block mb-1">Nome do cliente</label>
                <input
                  value={creditCustomerName}
                  onChange={e => setCreditCustomerName(e.target.value)}
                  placeholder="Quem fica a dever..."
                  className="w-full border border-amber-300 bg-amber-50 p-2 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-amber-700 mt-1">Vai para Contas a Receber — sem entrada em Caixa até ser liquidada.</p>
              </div>
            )}

            {isSplit && (
              <div className="mt-2 space-y-2 bg-purple-50 border border-purple-200 rounded-lg p-2">
                {splitPayments.map((sp, i) => (
                  <div key={i} className="flex gap-2">
                    <select
                      value={sp.method}
                      onChange={e => setSplitPayments(list => list.map((x, xi) => xi === i ? { ...x, method: e.target.value as PaymentSplitEntry['method'] } : x))}
                      className="border border-purple-300 bg-white p-2 rounded-lg text-sm w-32"
                    >
                      <option value="dinheiro">💵 Dinheiro</option>
                      <option value="multicaixa">💳 Multicaixa</option>
                      <option value="express">📱 Express</option>
                    </select>
                    <input
                      type="number" min="0" step="1" placeholder="0"
                      value={sp.amount || ''}
                      onChange={e => setSplitPayments(list => list.map((x, xi) => xi === i ? { ...x, amount: Number(e.target.value) } : x))}
                      className="flex-1 border border-purple-300 p-2 rounded-lg text-sm"
                    />
                  </div>
                ))}
                {splitPayments.some(s => s.method === 'multicaixa' && s.amount > 0) && bankAccounts.length > 0 && (
                  <select
                    value={selectedBank}
                    onChange={e => setSelectedBank(e.target.value)}
                    className="w-full border border-purple-300 bg-white p-2 rounded-lg text-sm"
                  >
                    {bankAccounts.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                )}
                {(() => {
                  const sum = splitPayments.reduce((s, p) => s + (p.amount || 0), 0)
                  const diff = Math.round((cartTotal - sum) * 100) / 100
                  if (diff === 0) return <p className="text-xs font-bold text-green-700">✓ Total confere</p>
                  if (diff > 0) return <p className="text-xs font-bold text-purple-700">Falta {diff.toLocaleString('pt-AO')} Kz</p>
                  return <p className="text-xs font-bold text-red-600">A mais {Math.abs(diff).toLocaleString('pt-AO')} Kz</p>
                })()}
              </div>
            )}
          </div>

          {/* Promo */}
          <div>
            {appliedPromo ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 p-2 rounded-lg text-sm">
                <span className="text-green-700 font-bold font-mono">{appliedPromo.code} — -{discountAmount.toLocaleString()} Kz</span>
                <button onClick={() => { setAppliedPromo(null); setPromoInput('') }} className="text-green-500 hover:text-green-700 text-lg leading-none">×</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={promoInput} onChange={e => setPromoInput(e.target.value.toUpperCase())}
                  placeholder="Código promo..." onKeyDown={e => e.key === 'Enter' && applyPromo()}
                  className="flex-1 border p-2 rounded-lg text-xs font-mono uppercase" />
                <button onClick={applyPromo} className="bg-gray-100 px-2 rounded-lg hover:bg-gray-200"><Tag className="w-4 h-4" /></button>
              </div>
            )}
          </div>

          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span><span>{cartSubtotal.toLocaleString('pt-AO')} AOA</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600 font-medium">
              <span>Desconto</span><span>-{discountAmount.toLocaleString('pt-AO')} AOA</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>Total:</span>
            <span>{cartTotal.toLocaleString('pt-AO')} AOA</span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className={`w-full text-white py-3 rounded-lg font-bold transition disabled:opacity-50 ${isCredit ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700' : isSplit ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700' : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'}`}
          >
            {isCredit ? 'FINALIZAR VENDA (FIADO)' : isSplit ? 'FINALIZAR VENDA (DIVIDIDA)' : 'FINALIZAR VENDA'}
          </button>
        </div>
      </div>

      {/* Weight Dialog */}
      {showWeightDialog && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center text-2xl shrink-0">
                  🐟
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">{selectedProduct.name}</h3>
                  <p className="text-xs text-gray-400">{Number(selectedProduct.price).toLocaleString('pt-AO')} AOA/kg · Stock: {selectedProduct.stock_quantity}kg</p>
                </div>
              </div>
              <button onClick={() => setShowWeightDialog(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">Peso (kg)</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setWeight(Math.max(0.1, parseFloat((weight - 0.1).toFixed(2))))}
                    className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-full text-2xl font-bold text-gray-600 flex items-center justify-center shrink-0 transition active:scale-95"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={weight}
                    onChange={e => setWeight(Math.max(0.1, parseFloat(parseFloat(e.target.value).toFixed(2)) || 0.1))}
                    step="0.1"
                    min="0.1"
                    autoFocus
                    onFocus={e => e.target.select()}
                    className="flex-1 min-w-0 w-full text-center text-3xl font-bold border-2 border-cyan-500 rounded-2xl py-2.5 focus:outline-none focus:ring-4 focus:ring-cyan-100 transition"
                  />
                  <button
                    onClick={() => setWeight(parseFloat((weight + 0.1).toFixed(2)))}
                    className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-full text-2xl font-bold text-gray-600 flex items-center justify-center shrink-0 transition active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>

              {(() => {
                const formatOptions = [
                  { key: 'inteiro' as PreparationType, label: 'Inteiro', available: selectedProduct.allow_whole },
                  { key: 'limpo' as PreparationType, label: 'Limpo', available: selectedProduct.allow_clean },
                  { key: 'filé' as PreparationType, label: 'Filé', available: selectedProduct.allow_fillet },
                  { key: 'posta' as PreparationType, label: 'Posta', available: selectedProduct.allow_steak },
                ].filter(o => o.available)
                if (formatOptions.length <= 1) return null
                return (
                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-2">Tipo de Preparo</label>
                    <div className="grid grid-cols-2 gap-2">
                      {formatOptions.map(o => (
                        <button
                          key={o.key}
                          onClick={() => setPreparation(o.key)}
                          className={`py-3 rounded-xl font-semibold transition ${preparation === o.key ? 'bg-cyan-600 text-white shadow-md shadow-cyan-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}

              <div className="bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-100 p-4 rounded-2xl text-center">
                <p className="text-xs font-semibold text-cyan-700/70 uppercase tracking-wide">Total</p>
                {selectedProduct.discount ? (
                  <div>
                    <p className="text-sm text-gray-400 line-through">{Number(selectedProduct.price * weight).toLocaleString('pt-AO')} AOA</p>
                    <p className="text-3xl font-black text-green-600 mt-0.5">{Number(effectivePrice(selectedProduct) * weight).toLocaleString('pt-AO')} AOA</p>
                    <p className="text-xs text-green-500 font-medium">Desconto {selectedProduct.discount}% aplicado</p>
                  </div>
                ) : (
                  <p className="text-3xl font-black text-cyan-700 mt-0.5">{Number(selectedProduct.price * weight).toLocaleString('pt-AO')} AOA</p>
                )}
              </div>

              <button
                onClick={addToCart}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3.5 rounded-2xl font-bold tracking-wide hover:from-cyan-700 hover:to-blue-700 transition shadow-lg shadow-cyan-200 active:scale-[0.99]"
              >
                ADICIONAR À VENDA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && lastOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            {/* Cabeçalho */}
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">✅</span>
              </div>
              <h2 className="font-black text-xl text-gray-800">Venda Concluída!</h2>
              <p className="text-gray-500 text-sm mt-1">Talão enviado para impressão</p>
            </div>

            {/* Resumo rápido */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-5 font-mono text-sm">
              <div className="flex justify-between font-bold text-base">
                <span>{lastOrder.order_number}</span>
                <span className="text-cyan-700">{Number(lastOrder.total).toLocaleString('pt-AO')} AOA</span>
              </div>
              <div className="border-t pt-2 space-y-1 text-gray-600">
                {lastOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span>{item.product_name} ({item.preparation}) {Number(item.quantity).toFixed(2)}kg</span>
                    <span>{Number(item.total_price).toLocaleString('pt-AO')}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 text-xs text-gray-500 text-center">
                {lastOrder.payment_type.charAt(0).toUpperCase() + lastOrder.payment_type.slice(1)} • {new Date(lastOrder.created_at).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => printReceipt(lastOrder, settings)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 py-2 rounded-xl font-semibold text-sm flex items-center justify-center gap-1 transition"
                title="Talão térmico simples"
              >
                <Receipt className="w-4 h-4" /> Talão
              </button>
              <button
                onClick={() => printInvoice(lastOrder, settings)}
                className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-xl font-semibold text-sm flex items-center justify-center gap-1 transition"
                title="Talão completo A4"
              >
                <Printer className="w-4 h-4" /> A4
              </button>
              <button
                onClick={() => printBusinessInvoice(lastOrder, settings)}
                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 py-2 rounded-xl font-semibold text-sm flex items-center justify-center gap-1 transition"
                title="Fatura AGT para empresas"
              >
                <ShoppingBag className="w-4 h-4" /> Fatura
              </button>
            </div>
            <button
              onClick={() => setShowReceipt(false)}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-xl font-semibold text-sm transition hover:from-green-700 hover:to-emerald-700 mt-1"
            >
              Nova Venda
            </button>
          </div>
        </div>
      )}
      </div>} {/* fim tab POS */}
    </div>
  )
}
