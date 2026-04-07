import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import type { Product, Category, PreparationType } from '../types/database'

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

interface CartItem extends Product {
  quantity: number
  preparation: PreparationType
}

export default function Catalog() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart] = useState(false)

  // Load products and categories from localStorage
  useEffect(() => {
    const savedProducts = localStorage.getItem('khrismir_products')
    if (savedProducts) {
      setProducts(JSON.parse(savedProducts))
    } else {
      localStorage.setItem('khrismir_products', JSON.stringify(initialProducts))
    }

    const savedCategories = localStorage.getItem('khrismir_categories')
    if (savedCategories) {
      setCategories(JSON.parse(savedCategories))
    } else {
      localStorage.setItem('khrismir_categories', JSON.stringify(initialCategories))
    }

    const savedCart = localStorage.getItem('khrismir_cart')
    if (savedCart) setCart(JSON.parse(savedCart))
  }, [])

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart)
    localStorage.setItem('khrismir_cart', JSON.stringify(newCart))
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory
    return matchesSearch && matchesCategory
  })

  const addToCart = (product: Product, preparation: PreparationType) => {
    const existing = cart.find(c => c.id === product.id && c.preparation === preparation)
    if (existing) {
      saveCart(cart.map(c => c.id === product.id && c.preparation === preparation ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      saveCart([...cart, { ...product, quantity: 1, preparation }])
    }
    toast.success(`${product.name} (${preparation}) adicionado!`)
  }

  const removeFromCart = (id: string, preparation: PreparationType) => {
    saveCart(cart.filter(c => !(c.id === id && c.preparation === preparation)))
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0)

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Products Grid */}
      <div className="flex-1">
        {/* Search & Filter */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
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
              <option value="">Todas as categorias</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Products */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <ProductCard key={product.id} product={product} onAdd={addToCart} />
          ))}
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className={`lg:w-96 ${showCart ? 'block' : 'hidden'} lg:block`}>
        <div className="bg-white rounded-xl shadow-lg p-4 sticky top-4">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> Carrinho ({cart.length})
          </h3>
          
          {cart.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Carrinho vazio</p>
          ) : (
            <>
              <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-500">{item.preparation} • {item.quantity}x</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{Number(item.price * item.quantity).toLocaleString('pt-AO')} AOA</p>
                      <button
                        onClick={() => removeFromCart(item.id, item.preparation)}
                        className="text-red-500 text-sm hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between text-lg font-bold mb-4">
                  <span>Total:</span>
                  <span>{cartTotal.toLocaleString('pt-AO')} AOA</span>
                </div>
                <button
                  onClick={() => navigate('/cart')}
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-cyan-700 hover:to-blue-700 transition"
                >
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

  const prepOptions: { key: PreparationType; label: string; available: boolean }[] = [
    { key: 'inteiro', label: 'Inteiro', available: product.allow_whole },
    { key: 'limpo', label: 'Limpo', available: product.allow_clean },
    { key: 'filé', label: 'Filé', available: product.allow_fillet },
    { key: 'posta', label: 'Posta', available: product.allow_steak },
  ]

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition">
      <div className="h-40 bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center">
        <span className="text-6xl">🐟</span>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-lg">{product.name}</h3>
        <p className="text-cyan-600 font-bold text-xl">{Number(product.price).toLocaleString('pt-AO')} AOA/{product.unit}</p>
        <p className="text-sm text-gray-500 mb-3">Stock: {product.stock_quantity} {product.unit}</p>
        
        {!showOptions ? (
          <button
            onClick={() => setShowOptions(true)}
            className="w-full bg-cyan-100 text-cyan-700 py-2 rounded-lg font-medium hover:bg-cyan-200 transition flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">Escolha o preparo:</p>
            <div className="grid grid-cols-2 gap-2">
              {prepOptions.map(opt => (
                opt.available && (
                  <button
                    key={opt.key}
                    onClick={() => { onAdd(product, opt.key); setShowOptions(false) }}
                    className="bg-cyan-600 text-white py-2 rounded-lg text-sm hover:bg-cyan-700 transition"
                  >
                    {opt.label}
                  </button>
                )
              ))}
            </div>
            <button
              onClick={() => setShowOptions(false)}
              className="w-full text-gray-500 text-sm hover:underline"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
