import { useState, useEffect } from 'react'
import { Search, Trash2, X, Printer, Receipt, Tag, ShoppingBag, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { Product, Category, CartItem, Order, OrderStatus, PaymentType, PreparationType, PromoCode } from '../types/database'
import { getSettings } from '../lib/settings'
import { printInvoice, printBusinessInvoice } from '../utils/invoice'
import { printReceipt } from '../utils/receipt'
import { registerSaleMovement } from '../lib/cashflow'
import { getOpenShift } from './_TurnoTab'
import { calcOrderHash } from '../utils/saft'
import { pullAll, syncOrderStatus, syncOrder, syncProductStock, syncCashFlow } from '../lib/sync'
import { notifyDataChange } from '../lib/realtime'
import { isSupabaseReady } from '../lib/supabase'

const initialCategories: Category[] = [
  { id: '1', name: 'Pescado Fresco', description: 'Peixes frescos do dia' },
  { id: '2', name: 'Mariscos', description: 'Camarão, polvo, lulas' },
  { id: '3', name: 'Peixes Grandes', description: 'Peixes de maior porte' },
]

const initialProducts: Product[] = [
  { id: '1', name: 'Sardinha', price: 1500, unit: 'kg', stock_quantity: 50, min_stock: 10, allow_whole: true, allow_clean: true, allow_fillet: false, allow_steak: false, category_id: '1', image_url: '' },
  { id: '2', name: 'Atum', price: 2500, unit: 'kg', stock_quantity: 30, min_stock: 5, allow_whole: true, allow_clean: true, allow_fillet: true, allow_steak: true, category_id: '1', image_url: '' },
  { id: '3', name: 'Pargo', price: 3000, unit: 'kg', stock_quantity: 20, min_stock: 5, allow_whole: true, allow_clean: true, allow_fillet: true, allow_steak: true, category_id: '1', image_url: '' },
  { id: '4', name: 'Camarão Grande', price: 4500, unit: 'kg', stock_quantity: 15, min_stock: 3, allow_whole: true, allow_clean: false, allow_fillet: false, allow_steak: false, category_id: '2', image_url: '' },
  { id: '5', name: 'Polvo', price: 5000, unit: 'kg', stock_quantity: 10, min_stock: 2, allow_whole: true, allow_clean: false, allow_fillet: false, allow_steak: false, category_id: '2', image_url: '' },
  { id: '6', name: 'Lingueirão', price: 3500, unit: 'kg', stock_quantity: 8, min_stock: 2, allow_whole: true, allow_clean: true, allow_fillet: false, allow_steak: false, category_id: '2', image_url: '' },
]

interface POSCartItem extends CartItem {
  weight: number
  total_price: number
}

export default function POS() {
  const settings = getSettings()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [cart, setCart] = useState<POSCartItem[]>([])
  const [paymentType, setPaymentType] = useState<PaymentType>('multicaixa')
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
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory
    return matchesSearch && matchesCategory && p.stock_quantity > 0
  })

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
  }

  const removeFromCart = (idx: number) => {
    saveCart(cart.filter((_, i) => i !== idx))
  }

  const updateQuantity = (idx: number, delta: number) => {
    const newCart = [...cart]
    newCart[idx].quantity = Math.max(1, newCart[idx].quantity + delta)
    newCart[idx].total_price = newCart[idx].weight * newCart[idx].price * newCart[idx].quantity
    saveCart(newCart)
  }

  const cartSubtotal = cart.reduce((sum, c) => sum + c.weight * c.price * c.quantity, 0)
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

    const openShift = getOpenShift()
    if (!openShift) {
      toast.warning('Abra um turno antes de processar vendas. Vá a Caixa → Turno.')
      return
    }

    const orderNumber = `PKH-${Math.floor(10000 + Math.random() * 90000)}`
    const now = Date.now()

    const orderBase = {
      id: now.toString(),
      order_number: orderNumber,
      status: 'pronto' as const,
      payment_type: paymentType,
      delivery_type: 'retirada' as const,
      subtotal: cartSubtotal,
      discount_code: appliedPromo?.code,
      discount_amount: discountAmount || undefined,
      total: cartTotal,
      items: cart.map((c, i) => ({
        id: `${now}-${i}`,
        order_id: now.toString(),
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

    const storedProducts = JSON.parse(localStorage.getItem('khrismir_products') || JSON.stringify(initialProducts))
    cart.forEach(cartItem => {
      const idx = storedProducts.findIndex((p: Product) => p.id === cartItem.id)
      if (idx !== -1) storedProducts[idx].stock_quantity = Math.max(0, storedProducts[idx].stock_quantity - cartItem.weight * cartItem.quantity)
    })
    localStorage.setItem('khrismir_products', JSON.stringify(storedProducts))
    // Actualiza o estado React imediatamente para reflectir o novo stock na UI
    setProducts(storedProducts)

    const bankAccount = paymentType === 'multicaixa' ? selectedBank : undefined
    registerSaleMovement(cartTotal, orderNumber, paymentType, now.toString(), bankAccount)

    if (newOrder.customer_id) {
      const loyaltyTx = { id: Date.now().toString(), client_id: newOrder.customer_id, client_name: newOrder.customer_name || '', points: Math.floor(cartTotal / 1000), type: 'earned', order_id: newOrder.id, created_at: new Date().toISOString() }
      const loyalty = JSON.parse(localStorage.getItem('khrismir_loyalty') || '[]')
      loyalty.push(loyaltyTx)
      localStorage.setItem('khrismir_loyalty', JSON.stringify(loyalty))
    }

    if (appliedPromo) {
      const promos: PromoCode[] = JSON.parse(localStorage.getItem('khrismir_promos') || '[]')
      const pi = promos.findIndex(p => p.id === appliedPromo.id)
      if (pi !== -1) { promos[pi].uses += 1; localStorage.setItem('khrismir_promos', JSON.stringify(promos)) }
    }

    saveCart([])
    setAppliedPromo(null)
    setPromoInput('')
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
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-2 bg-white rounded-xl shadow-sm p-1.5 w-fit">
        <button onClick={() => setActiveTab('pos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'pos' ? 'bg-cyan-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}>
          <Receipt className="w-4 h-4" /> Caixa (POS)
        </button>
        <button onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${activeTab === 'orders' ? 'bg-cyan-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}>
          <ShoppingBag className="w-4 h-4" /> Encomendas
          {pendingCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5">{pendingCount}</span>}
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
                type="text"
                placeholder="Buscar produtos..."
                value={search}
                onChange={e => setSearch(e.target.value)}
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

        {/* Products */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto flex-1">
          {filteredProducts.map(product => (
            <button
              key={product.id}
              onClick={() => openWeightDialog(product)}
              className="bg-white rounded-xl shadow-lg p-4 hover:shadow-xl transition text-left"
            >
              <div className="h-20 bg-gradient-to-br from-cyan-100 to-blue-100 rounded-lg flex items-center justify-center text-4xl mb-2">
                🐟
              </div>
              <h3 className="font-bold text-sm truncate">{product.name}</h3>
              {product.discount ? (
                <div>
                  <p className="text-xs text-gray-400 line-through">{Number(product.price).toLocaleString('pt-AO')}</p>
                  <p className="text-green-600 font-bold text-sm">{effectivePrice(product).toLocaleString('pt-AO')} AOA/kg <span className="text-xs bg-green-100 text-green-700 px-1 rounded">-{product.discount}%</span></p>
                </div>
              ) : (
                <p className="text-cyan-600 font-bold">{Number(product.price).toLocaleString('pt-AO')} AOA/kg</p>
              )}
              <p className="text-xs text-gray-500">Stock: {product.stock_quantity}kg</p>
            </button>
          ))}
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="lg:w-96 bg-white rounded-xl shadow-lg flex flex-col">
        <div className="p-4 border-b">
          <h3 className="font-bold flex items-center gap-2">
            <Receipt className="w-5 h-5" /> Venda Atual
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Adicione produtos</p>
          ) : (
            <div className="space-y-3">
              {cart.map((item, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{item.preparation} • {item.weight}kg</p>
                    </div>
                    <button onClick={() => removeFromCart(idx)} className="text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(idx, -1)} className="w-6 h-6 bg-gray-200 rounded-full">-</button>
                      <span className="text-sm">{item.quantity}x</span>
                      <button onClick={() => updateQuantity(idx, 1)} className="w-6 h-6 bg-gray-200 rounded-full">+</button>
                    </div>
                    <span className="font-bold">{Number(item.weight * item.price * item.quantity).toLocaleString('pt-AO')} AOA</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment & Checkout */}
        <div className="p-4 border-t space-y-4">
          <div>
            <label className="text-sm font-medium block mb-2">Pagamento</label>
            <div className="grid grid-cols-3 gap-2">
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
            {paymentType === 'multicaixa' && bankAccounts.length > 0 && (
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
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-lg font-bold hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50"
          >
            FINALIZAR VENDA
          </button>
        </div>
      </div>

      {/* Weight Dialog */}
      {showWeightDialog && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-xl">{selectedProduct.name}</h3>
              <button onClick={() => setShowWeightDialog(false)}><X className="w-6 h-6" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Peso (kg)</label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setWeight(Math.max(0.1, weight - 0.1))}
                    className="w-12 h-12 bg-gray-100 rounded-lg text-2xl font-bold"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={weight}
                    onChange={e => setWeight(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                    step="0.1"
                    min="0.1"
                    className="flex-1 text-center text-3xl font-bold border-2 border-cyan-600 rounded-lg py-2"
                  />
                  <button
                    onClick={() => setWeight(weight + 0.1)}
                    className="w-12 h-12 bg-gray-100 rounded-lg text-2xl font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tipo de Preparo</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'inteiro', label: 'Inteiro', available: selectedProduct.allow_whole },
                    { key: 'limpo', label: 'Limpo', available: selectedProduct.allow_clean },
                    { key: 'filé', label: 'Filé', available: selectedProduct.allow_fillet },
                    { key: 'posta', label: 'Posta', available: selectedProduct.allow_steak },
                  ].filter(o => o.available).map(o => (
                    <button
                      key={o.key}
                      onClick={() => setPreparation(o.key as PreparationType)}
                      className={`p-3 rounded-lg font-medium ${preparation === o.key ? 'bg-cyan-600 text-white' : 'bg-gray-100'}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-cyan-50 p-4 rounded-lg text-center">
                <p className="text-sm text-gray-600">Total</p>
                {selectedProduct.discount ? (
                  <div>
                    <p className="text-sm text-gray-400 line-through">{Number(selectedProduct.price * weight).toLocaleString('pt-AO')} AOA</p>
                    <p className="text-3xl font-bold text-green-600">{Number(effectivePrice(selectedProduct) * weight).toLocaleString('pt-AO')} AOA</p>
                    <p className="text-xs text-green-500">Desconto {selectedProduct.discount}% aplicado</p>
                  </div>
                ) : (
                  <p className="text-3xl font-bold text-cyan-600">{Number(selectedProduct.price * weight).toLocaleString('pt-AO')} AOA</p>
                )}
              </div>

              <button
                onClick={addToCart}
                className="w-full bg-cyan-600 text-white py-3 rounded-lg font-bold hover:bg-cyan-700"
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
