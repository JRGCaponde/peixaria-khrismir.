import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ShoppingCart, X, Minus } from 'lucide-react'
import { toast } from 'sonner'
import type { Product, Category, PreparationType } from '../types/database'
import { pullAll } from '../lib/sync'

// Sem dados fictícios — carrega apenas do localStorage / Supabase
const initialCategories: Category[] = []
const initialProducts: Product[] = []

interface CartItem extends Product {
  quantity:    number
  preparation: PreparationType
}

export default function Catalog() {
  const navigate = useNavigate()
  const [categories,       setCategories]       = useState<Category[]>(initialCategories)
  const [products,         setProducts]         = useState<Product[]>(initialProducts)
  const [search,           setSearch]           = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [cart,             setCart]             = useState<CartItem[]>([])
  const [showCart,         setShowCart]         = useState(false)

  useEffect(() => {
    const tryParse = (key: string, fallback: any) => {
      try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
    }
    // Carrega do localStorage imediatamente (rápido)
    setProducts(tryParse('khrismir_products', initialProducts))
    setCategories(tryParse('khrismir_categories', initialCategories))
    setCart(tryParse('khrismir_cart', []))
    // Depois actualiza com dados frescos do Supabase
    pullAll().then(() => {
      setProducts(tryParse('khrismir_products', initialProducts))
      setCategories(tryParse('khrismir_categories', initialCategories))
    })
  }, [])

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart)
    localStorage.setItem('khrismir_cart', JSON.stringify(newCart))
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch   = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory
    return matchesSearch && matchesCategory && p.stock_quantity > 0
  })

  const addToCart = (product: Product, preparation: PreparationType) => {
    const existing = cart.find(c => c.id === product.id && c.preparation === preparation)
    if (existing) {
      saveCart(cart.map(c => c.id === product.id && c.preparation === preparation ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      saveCart([...cart, { ...product, quantity: 1, preparation }])
    }
    toast.success(`${product.name} (${preparation}) adicionado!`)
    setShowCart(true)
  }

  const updateQuantity = (id: string, preparation: PreparationType, delta: number) => {
    const item = cart.find(c => c.id === id && c.preparation === preparation)
    if (!item) return
    if (item.quantity + delta <= 0) {
      saveCart(cart.filter(c => !(c.id === id && c.preparation === preparation)))
    } else {
      saveCart(cart.map(c => c.id === id && c.preparation === preparation ? { ...c, quantity: c.quantity + delta } : c))
    }
  }

  const cartTotal     = cart.reduce((sum, c) => sum + c.price * c.quantity, 0)
  const cartItemCount = cart.reduce((sum, c) => sum + c.quantity, 0)

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1">
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input type="text" placeholder="Buscar produtos..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500" />
            </div>
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500">
              <option value="">Todas as categorias</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {cartItemCount > 0 && (
          <button onClick={() => setShowCart(true)}
            className="lg:hidden fixed bottom-6 right-6 z-30 bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 font-bold">
            <ShoppingCart className="w-5 h-5" />
            <span>{cartItemCount} {cartItemCount === 1 ? 'item' : 'itens'}</span>
            <span className="bg-white/20 px-2 py-0.5 rounded-lg text-sm">{cartTotal.toLocaleString('pt-AO')} AOA</span>
          </button>
        )}

        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-lg">
            <span className="text-6xl">🐟</span>
            <p className="text-gray-500 mt-4">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-24 lg:pb-0">
            {filteredProducts.map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} />)}
          </div>
        )}
      </div>

      {showCart && <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setShowCart(false)} />}

      <div className={`lg:w-96 ${showCart ? 'fixed inset-y-0 right-0 z-40 w-[85vw] sm:w-80 shadow-2xl' : 'hidden lg:block'}`}>
        <div className="bg-white h-full lg:h-auto rounded-none lg:rounded-xl shadow-lg p-4 lg:sticky lg:top-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Carrinho
              {cartItemCount > 0 && <span className="bg-cyan-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{cartItemCount}</span>}
            </h3>
            <button onClick={() => setShowCart(false)} className="lg:hidden p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500 text-center py-8">O carrinho está vazio</p>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto mb-4 max-h-[60vh] lg:max-h-96">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{item.preparation}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQuantity(item.id, item.preparation, -1)} className="w-8 h-8 sm:w-7 sm:h-7 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 text-lg font-bold"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.preparation, 1)} className="w-8 h-8 sm:w-7 sm:h-7 bg-cyan-600 text-white rounded-full flex items-center justify-center hover:bg-cyan-700 text-lg font-bold"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                    <p className="font-bold text-sm ml-2 whitespace-nowrap">{Number(item.price * item.quantity).toLocaleString('pt-AO')} AOA</p>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-cyan-600">{cartTotal.toLocaleString('pt-AO')} AOA</span>
                </div>
                <button onClick={() => navigate('/cart')}
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-cyan-700 hover:to-blue-700 transition">
                  Finalizar Pedido
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product, prep: PreparationType) => void }) {
  const [showOptions, setShowOptions] = useState(false)

  const prepOptions = [
    { key: 'inteiro' as PreparationType, label: 'Inteiro', available: product.allow_whole  },
    { key: 'limpo'   as PreparationType, label: 'Limpo',   available: product.allow_clean  },
    { key: 'filé'    as PreparationType, label: 'Filé',    available: product.allow_fillet },
    { key: 'posta'   as PreparationType, label: 'Posta',   available: product.allow_steak  },
  ].filter(o => o.available)

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
      <div className="h-40 bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          : <span className="text-6xl">🐟</span>
        }
      </div>
      <div className="p-4">
        <h3 className="font-bold text-lg leading-tight">{product.name}</h3>
        <p className="text-cyan-600 font-bold text-xl mt-0.5">{Number(product.price).toLocaleString('pt-AO')} AOA/{product.unit}</p>
        <p className="text-sm text-gray-500 mb-3">Stock: {product.stock_quantity} {product.unit}</p>

        {!showOptions ? (
          <button onClick={() => prepOptions.length === 1 ? onAdd(product, prepOptions[0].key) : setShowOptions(true)}
            className="w-full bg-cyan-100 text-cyan-700 py-2 rounded-lg font-medium hover:bg-cyan-200 transition flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Escolha o preparo:</p>
            <div className="grid grid-cols-2 gap-2">
              {prepOptions.map(opt => (
                <button key={opt.key} onClick={() => { onAdd(product, opt.key); setShowOptions(false) }}
                  className="bg-cyan-600 text-white py-2 rounded-lg text-sm hover:bg-cyan-700 transition font-medium">
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowOptions(false)} className="w-full text-gray-400 text-sm hover:text-gray-600 hover:underline">Cancelar</button>
          </div>
        )}
      </div>
    </div>
  )
}
