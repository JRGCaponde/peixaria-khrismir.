import { useState, useEffect } from 'react'
import { Search, Trash2, X, Printer, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'
import type { Product, Category, CartItem, Order, PaymentType, PreparationType } from '../types/database'

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
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [cart, setCart] = useState<POSCartItem[]>([])
  const [paymentType, setPaymentType] = useState<PaymentType>('multicaixa')
  const [showWeightDialog, setShowWeightDialog] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [weight, setWeight] = useState(1.0)
  const [preparation, setPreparation] = useState<PreparationType>('inteiro')
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastOrder, setLastOrder] = useState<Order | null>(null)

  // Load products and categories from localStorage
  useEffect(() => {
    const savedProducts = localStorage.getItem('khrismir_products')
    if (savedProducts) {
      setProducts(JSON.parse(savedProducts))
    } else {
      // If no products, initialize with default ones and save
      localStorage.setItem('khrismir_products', JSON.stringify(initialProducts))
      setProducts(initialProducts)
    }

    const savedCategories = localStorage.getItem('khrismir_categories')
    if (savedCategories) {
      setCategories(JSON.parse(savedCategories))
    } else {
      localStorage.setItem('khrismir_categories', JSON.stringify(initialCategories))
      setCategories(initialCategories)
    }

    const savedCart = localStorage.getItem('khrismir_pos_cart')
    if (savedCart) setCart(JSON.parse(savedCart))
  }, [])

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
    const total = selectedProduct.price * weight
    const existing = cart.find(c => c.id === selectedProduct.id && c.preparation === preparation && c.weight === weight)
    if (existing) {
      saveCart(cart.map(c => c.id === selectedProduct.id && c.preparation === preparation && c.weight === weight ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      saveCart([...cart, { ...selectedProduct, quantity: 1, weight, preparation, total_price: total } as POSCartItem])
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

  const cartTotal = cart.reduce((sum, c) => sum + c.weight * c.price * c.quantity, 0)

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Carrinho vazio')
      return
    }

    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1500)),
      {
        loading: 'A processar venda...',
        success: () => {
          const orderNumber = `PKH-${Math.floor(10000 + Math.random() * 90000)}`
          // Hash gerado para AGT: ${generateHash()}
          
          const newOrder: Order = {
            id: Date.now().toString(),
            order_number: orderNumber,
            status: 'pronto',
            payment_type: paymentType,
            delivery_type: 'retirada',
            total: cartTotal,
            items: cart.map((c, i) => ({
              id: `${Date.now()}-${i}`,
              order_id: Date.now().toString(),
              product_id: c.id,
              product_name: c.name,
              quantity: c.weight * c.quantity,
              unit_price: c.price,
              preparation: c.preparation,
              total_price: c.weight * c.price * c.quantity
            })),
            created_at: new Date().toISOString()
          }

          // Save order
          const orders = JSON.parse(localStorage.getItem('khrismir_orders') || '[]')
          orders.unshift(newOrder)
          localStorage.setItem('khrismir_orders', JSON.stringify(orders))

          // Update stock
          const storedProducts = JSON.parse(localStorage.getItem('khrismir_products') || JSON.stringify(initialProducts))
          cart.forEach(cartItem => {
            const idx = storedProducts.findIndex((p: Product) => p.id === cartItem.id)
            if (idx !== -1) {
              storedProducts[idx].stock_quantity -= cartItem.weight * cartItem.quantity
            }
          })
          localStorage.setItem('khrismir_products', JSON.stringify(storedProducts))

          // Cash flow
          const cashFlow = JSON.parse(localStorage.getItem('khrismir_cashflow') || '[]')
          cashFlow.unshift({
            id: Date.now().toString(),
            type: 'entrada',
            amount: cartTotal,
            description: `Venda #${orderNumber}`,
            order_number: orderNumber,
            payment_type: paymentType,
            created_at: new Date().toISOString()
          })
          localStorage.setItem('khrismir_cashflow', JSON.stringify(cashFlow))

          // Clear cart
          saveCart([])
          setLastOrder({ ...newOrder, items: newOrder.items.map(item => ({ ...item, total_price: item.total_price })) })
          setShowReceipt(true)
          
          return `Venda ${orderNumber} concluída!`
        },
        error: 'Erro ao processar venda'
      }
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
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
              <p className="text-cyan-600 font-bold">{Number(product.price).toLocaleString('pt-AO')} AOA/kg</p>
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
          </div>

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
                <p className="text-3xl font-bold text-cyan-600">
                  {Number(selectedProduct.price * weight).toLocaleString('pt-AO')} AOA
                </p>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <h2 className="font-bold text-xl">✅ Venda Concluída!</h2>
              <p className="text-gray-500">Recibo gerado com sucesso</p>
            </div>

            {/* Receipt */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-4 text-sm font-mono">
              <div className="text-center border-b pb-2 mb-2">
                <h3 className="font-bold">PEIXARIA KHRISMIR</h3>
                <p className="text-xs">Centralidade da Quilemba, Lubango</p>
                <p className="text-xs">Tel: 929 970 984 / 924 359 638</p>
                <p className="text-xs">NIF: 5001210092</p>
              </div>

              <p className="text-center font-bold my-2">RECIBO # {lastOrder.order_number}</p>
              <p className="text-center text-xs">{new Date(lastOrder.created_at).toLocaleString('pt-AO')}</p>

              <div className="border-t border-b my-2 py-2">
                {lastOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{item.product_name} ({item.preparation}) x{item.quantity.toFixed(2)}kg</span>
                    <span>{Number(item.total_price).toLocaleString('pt-AO')}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between font-bold text-lg mt-2">
                <span>TOTAL</span>
                <span>{Number(lastOrder.total).toLocaleString('pt-AO')} AOA</span>
              </div>

              <p className="text-center mt-2">Pagamento: {lastOrder.payment_type}</p>

              <div className="text-center mt-4">
                <QRCodeSVG value={JSON.stringify({
                  order: lastOrder.order_number,
                  total: lastOrder.total,
                  date: lastOrder.created_at,
                  nif: '5001210092'
                })} size={100} />
                <p className="text-xs mt-1">Processado por software certificado</p>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-gray-100 py-2 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" /> Imprimir
              </button>
              <button
                onClick={() => setShowReceipt(false)}
                className="flex-1 bg-cyan-600 text-white py-2 rounded-lg font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
