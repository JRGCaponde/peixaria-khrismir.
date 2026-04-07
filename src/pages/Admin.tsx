import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Search, Plus, Trash2, Edit, X, Package, Users, TrendingUp, DollarSign, FileText, Settings, Database, Printer } from 'lucide-react'
import type { Product, Category, Order, User, CashFlow, Employee } from '../types/database'

type Tab = 'overview' | 'products' | 'categories' | 'orders' | 'employees' | 'cashflow' | 'reports' | 'purchases' | 'settings' | 'system' | 'agt'

const initialCategories: Category[] = [
  { id: '1', name: 'Pescado Fresco', description: 'Peixes frescos do dia' },
  { id: '2', name: 'Mariscos', description: 'Camarão, polvo, lulas' },
  { id: '3', name: 'Peixes Grandes', description: 'Peixes de maior porte' },
]

const initialProducts: Product[] = [
  { id: '1', name: 'Sardinha', price: 1500, unit: 'kg', stock_quantity: 50, min_stock: 10, allow_whole: true, allow_clean: true, allow_fillet: false, allow_steak: false, category_id: '1' },
  { id: '2', name: 'Atum', price: 2500, unit: 'kg', stock_quantity: 30, min_stock: 5, allow_whole: true, allow_clean: true, allow_fillet: true, allow_steak: true, category_id: '1' },
  { id: '3', name: 'Pargo', price: 3000, unit: 'kg', stock_quantity: 20, min_stock: 5, allow_whole: true, allow_clean: true, allow_fillet: true, allow_steak: true, category_id: '1' },
  { id: '4', name: 'Camarão Grande', price: 4500, unit: 'kg', stock_quantity: 15, min_stock: 3, allow_whole: true, allow_clean: false, allow_fillet: false, allow_steak: false, category_id: '2' },
  { id: '5', name: 'Polvo', price: 5000, unit: 'kg', stock_quantity: 10, min_stock: 2, allow_whole: true, allow_clean: false, allow_fillet: false, allow_steak: false, category_id: '2' },
  { id: '6', name: 'Lingueirão', price: 3500, unit: 'kg', stock_quantity: 8, min_stock: 2, allow_whole: true, allow_clean: true, allow_fillet: false, allow_steak: false, category_id: '2' },
]

export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [orders, setOrders] = useState<Order[]>([])
  const [employees, setEmployees] = useState<User[]>([])
  const [cashFlow, setCashFlow] = useState<CashFlow[]>([])

  useEffect(() => {
    // Load all data from localStorage
    const storedOrders = localStorage.getItem('khrismir_orders')
    if (storedOrders) setOrders(JSON.parse(storedOrders))
    
    const storedEmployees = localStorage.getItem('khrismir_employees')
    if (storedEmployees) setEmployees(JSON.parse(storedEmployees))
    
    const storedCashFlow = localStorage.getItem('khrismir_cashflow')
    if (storedCashFlow) setCashFlow(JSON.parse(storedCashFlow))

    const storedProducts = localStorage.getItem('khrismir_products')
    if (storedProducts) setProducts(JSON.parse(storedProducts))
    else localStorage.setItem('khrismir_products', JSON.stringify(initialProducts))

    const storedCategories = localStorage.getItem('khrismir_categories')
    if (storedCategories) setCategories(JSON.parse(storedCategories))
    else localStorage.setItem('khrismir_categories', JSON.stringify(initialCategories))
  }, [])

  // Overview stats
  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString())
  const todayTotal = todayOrders.reduce((sum, o) => sum + o.total, 0)
  const lowStockProducts = products.filter(p => p.stock_quantity <= p.min_stock)

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: TrendingUp },
    { id: 'products', label: 'Produtos', icon: Package },
    { id: 'categories', label: 'Categorias', icon: Package },
    { id: 'orders', label: 'Pedidos', icon: FileText },
    { id: 'employees', label: 'Funcionários', icon: Users },
    { id: 'cashflow', label: 'Fluxo de Caixa', icon: DollarSign },
    { id: 'purchases', label: 'Compras', icon: Package },
    { id: 'reports', label: 'Relatórios', icon: FileText },
    { id: 'agt', label: 'AGT', icon: FileText },
    { id: 'settings', label: 'Configurações', icon: Settings },
    { id: 'system', label: 'Sistema', icon: Database },
  ]

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sidebar */}
      <div className="lg:w-64 bg-white rounded-xl shadow-lg p-4 h-fit">
        <h2 className="font-bold text-lg mb-4 px-2">Painel Admin</h2>
        <nav className="space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${activeTab === tab.id ? 'bg-cyan-600 text-white' : 'hover:bg-gray-100'}`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1">
        {activeTab === 'overview' && <OverviewTab orders={todayOrders} total={todayTotal} lowStock={lowStockProducts} products={products} />}
        {activeTab === 'products' && <ProductsTab products={products} setProducts={setProducts} categories={categories} />}
        {activeTab === 'categories' && <CategoriesTab categories={categories} setCategories={setCategories} />}
        {activeTab === 'orders' && <OrdersTab orders={orders} setOrders={setOrders} />}
        {activeTab === 'employees' && <EmployeesTab employees={employees} setEmployees={setEmployees} />}
        {activeTab === 'cashflow' && <CashFlowTab cashFlow={cashFlow} setCashFlow={setCashFlow} />}
        {activeTab === 'purchases' && <PurchasesTab products={products} setProducts={setProducts} cashFlow={cashFlow} setCashFlow={setCashFlow} />}
        {activeTab === 'reports' && <ReportsTab orders={orders} />}
        {activeTab === 'agt' && <AGTTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'system' && <SystemTab categories={categories} products={products} />}
      </div>
    </div>
  )
}

function OverviewTab({ orders, total, lowStock, products }: { orders: Order[]; total: number; lowStock: Product[]; products: Product[] }) {
  const pendingOrders = orders.filter(o => o.status === 'pendente')
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Visão Geral</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-4">
            <div className="bg-cyan-100 p-3 rounded-full">
              <TrendingUp className="w-6 h-6 text-cyan-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Vendas Hoje</p>
              <p className="text-2xl font-bold">{total.toLocaleString('pt-AO')} AOA</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-4">
            <div className="bg-yellow-100 p-3 rounded-full">
              <Package className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pedidos Pendentes</p>
              <p className="text-2xl font-bold">{pendingOrders.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-4">
            <div className="bg-red-100 p-3 rounded-full">
              <Package className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Stock Baixo</p>
              <p className="text-2xl font-bold">{lowStock.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-4">
            <div className="bg-green-100 p-3 rounded-full">
              <Package className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Produtos</p>
              <p className="text-2xl font-bold">{products.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-bold text-red-800 mb-2">⚠️ Alerta de Stock Baixo</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {lowStock.map(p => (
              <div key={p.id} className="bg-white p-3 rounded-lg">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-red-600">Stock: {p.stock_quantity}kg (mín: {p.min_stock}kg)</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="font-bold mb-4">Últimos Pedidos</h3>
        <div className="space-y-2">
          {orders.slice(0, 5).map(order => (
            <div key={order.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">#{order.order_number}</p>
                <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleString('pt-AO')}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">{order.total.toLocaleString('pt-AO')} AOA</p>
                <span className={`text-xs px-2 py-1 rounded-full ${order.status === 'pendente' ? 'bg-yellow-100' : order.status === 'pronto' ? 'bg-green-100' : 'bg-gray-100'}`}>
                  {order.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProductsTab({ products, setProducts, categories }: { products: Product[]; setProducts: (p: Product[]) => void; categories: Category[] }) {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [form, setForm] = useState({ name: '', price: 0, stock_quantity: 0, min_stock: 5, category_id: '1', allow_whole: true, allow_clean: true, allow_fillet: false, allow_steak: false })

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const saveProduct = () => {
    if (!form.name || form.price <= 0) {
      toast.error('Preencha os campos obrigatórios')
      return
    }
    
    let updatedProducts: Product[]
    if (editProduct) {
      updatedProducts = products.map(p => p.id === editProduct.id ? { ...p, ...form } : p)
      toast.success('Produto atualizado!')
    } else {
      const newProduct: Product = { ...form, id: Date.now().toString(), unit: 'kg' }
      updatedProducts = [...products, newProduct]
      toast.success('Produto criado!')
    }
    
    setProducts(updatedProducts)
    localStorage.setItem('khrismir_products', JSON.stringify(updatedProducts))
    setShowForm(false)
    setEditProduct(null)
    setForm({ name: '', price: 0, stock_quantity: 0, min_stock: 5, category_id: '1', allow_whole: true, allow_clean: true, allow_fillet: false, allow_steak: false })
  }

  const deleteProduct = (id: string) => {
    if (!confirm('Tem certeza?')) return
    const updated = products.filter(p => p.id !== id)
    setProducts(updated)
    localStorage.setItem('khrismir_products', JSON.stringify(updated))
    toast.success('Produto eliminado!')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Produtos</h2>
        <button onClick={() => setShowForm(true)} className="bg-cyan-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo Produto
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar produtos..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Categoria</th>
              <th className="px-4 py-3 text-right">Preço</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-500">{categories.find(c => c.id === p.category_id)?.name}</td>
                <td className="px-4 py-3 text-right">{Number(p.price).toLocaleString('pt-AO')} AOA/kg</td>
                <td className="px-4 py-3 text-right">{p.stock_quantity}kg</td>
                <td className="px-4 py-3 text-center space-x-2">
                  <button onClick={() => { setEditProduct(p); setForm(p); setShowForm(true) }} className="text-cyan-600"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => deleteProduct(p.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Product Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-xl">{editProduct ? 'Editar' : 'Novo'} Produto</h3>
              <button onClick={() => { setShowForm(false); setEditProduct(null) }}><X className="w-6 h-6" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Preço (AOA/kg)</label>
                  <input type="number" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Categoria</label>
                  <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className="w-full p-2 border rounded-lg">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Stock (kg)</label>
                  <input type="number" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: parseFloat(e.target.value) || 0 })} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Stock Mínimo</label>
                  <input type="number" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: parseFloat(e.target.value) || 0 })} className="w-full p-2 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Tipos de Preparo</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: 'allow_whole', label: 'Inteiro' },
                    { key: 'allow_clean', label: 'Limpo' },
                    { key: 'allow_fillet', label: 'Filé' },
                    { key: 'allow_steak', label: 'Posta' },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form[opt.key as keyof typeof form] as boolean}
                        onChange={e => setForm({ ...form, [opt.key]: e.target.checked })}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={saveProduct} className="w-full bg-cyan-600 text-white py-3 rounded-lg font-bold">
                {editProduct ? 'Atualizar' : 'Criar'} Produto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoriesTab({ categories, setCategories }: { categories: Category[]; setCategories: (c: Category[]) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })

  const saveCategory = () => {
    if (!form.name) {
      toast.error('Nome é obrigatório')
      return
    }
    const newCat: Category = { ...form, id: Date.now().toString() }
    const updated = [...categories, newCat]
    setCategories(updated)
    localStorage.setItem('khrismir_categories', JSON.stringify(updated))
    toast.success('Categoria criada!')
    setShowForm(false)
    setForm({ name: '', description: '' })
  }

  const deleteCategory = (id: string) => {
    if (!confirm('Eliminar?')) return
    const updated = categories.filter(c => c.id !== id)
    setCategories(updated)
    localStorage.setItem('khrismir_categories', JSON.stringify(updated))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Categorias</h2>
        <button onClick={() => setShowForm(true)} className="bg-cyan-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova Categoria
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(cat => (
          <div key={cat.id} className="bg-white rounded-xl shadow-lg p-4">
            <h3 className="font-bold text-lg">{cat.name}</h3>
            <p className="text-gray-500 text-sm">{cat.description}</p>
            <button onClick={() => deleteCategory(cat.id)} className="text-red-500 text-sm mt-2">Eliminar</button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-xl mb-4">Nova Categoria</h3>
            <div className="space-y-4">
              <input type="text" placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full p-2 border rounded-lg" />
              <input type="text" placeholder="Descrição" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full p-2 border rounded-lg" />
              <button onClick={saveCategory} className="w-full bg-cyan-600 text-white py-2 rounded-lg">Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OrdersTab({ orders, setOrders }: { orders: Order[]; setOrders: (o: Order[]) => void }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  const updateStatus = (orderId: string, status: string) => {
    const updated = orders.map(o => o.id === orderId ? { ...o, status: status as any } : o)
    setOrders(updated)
    localStorage.setItem('khrismir_orders', JSON.stringify(updated))
    toast.success('Status atualizado!')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Pedidos</h2>
      
      <div className="flex gap-2 flex-wrap">
        {['all', 'pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'cancelado'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-full text-sm ${filter === s ? 'bg-cyan-600 text-white' : 'bg-white'}`}>
            {s === 'all' ? 'Todos' : s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(order => (
          <div key={order.id} className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-bold">#{order.order_number}</p>
                <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleString('pt-AO')}</p>
              </div>
              <select value={order.status} onChange={e => updateStatus(order.id, e.target.value)} className="border rounded-lg p-1 text-sm">
                {['pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'cancelado'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <p className="font-bold text-lg">{order.total.toLocaleString('pt-AO')} AOA</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmployeesTab({ employees, setEmployees }: { employees: User[]; setEmployees: (e: User[]) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'employee' as 'employee' | 'admin', access_areas: ['pdv'] as string[] })

  const generateEmail = (name: string) => {
    const slug = name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '')
    return `${slug}@khrismir.com`
  }

  const saveEmployee = () => {
    if (!form.name || !form.email) {
      toast.error('Preencha os campos')
      return
    }
    const newEmp: Employee = {
      id: Date.now().toString(),
      email: form.email,
      full_name: form.name,
      phone: form.phone,
      role: form.role,
      access_areas: form.access_areas,
      password: '123456' // Senha padrão
    }
    const updated = [...employees, newEmp]
    setEmployees(updated)
    localStorage.setItem('khrismir_employees', JSON.stringify(updated))
    toast.success('Funcionário cadastrado! Senha: 123456')
    setShowForm(false)
    setForm({ name: '', email: '', phone: '', role: 'employee', access_areas: ['pdv'] })
  }

  const deleteEmployee = (id: string) => {
    if (!confirm('Eliminar funcionário?')) return
    const updated = employees.filter(e => e.id !== id)
    setEmployees(updated)
    localStorage.setItem('khrismir_employees', JSON.stringify(updated))
  }

  const toggleAccess = (area: string) => {
    const current = form.access_areas
    if (current.includes(area)) {
      setForm({ ...form, access_areas: current.filter(a => a !== area) })
    } else {
      setForm({ ...form, access_areas: [...current, area] })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Funcionários</h2>
        <button onClick={() => setShowForm(true)} className="bg-cyan-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo Funcionário
        </button>
      </div>

      <div className="grid gap-4">
        {employees.map(emp => (
          <div key={emp.id} className="bg-white rounded-xl shadow-lg p-4 flex justify-between items-center">
            <div>
              <p className="font-bold">{emp.full_name}</p>
              <p className="text-sm text-gray-500">{emp.email}</p>
              <p className="text-sm">{emp.phone}</p>
              <span className="text-xs bg-cyan-100 px-2 py-1 rounded">{emp.role}</span>
            </div>
            <button onClick={() => deleteEmployee(emp.id)} className="text-red-500"><Trash2 className="w-5 h-5" /></button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h3 className="font-bold text-xl mb-4">Novo Funcionário</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value, email: generateEmail(e.target.value) })}
                  className="w-full p-2 border rounded-lg"
                  placeholder="Nome"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email (auto-gerado)</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Telefone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cargo</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as 'employee' | 'admin' })} className="w-full p-2 border rounded-lg">
                  <option value="employee">Funcionário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Áreas de Acesso</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'pdv', label: 'PDV' },
                    { key: 'pedidos', label: 'Pedidos' },
                    { key: 'relatorios', label: 'Relatórios' },
                    { key: 'estoque', label: 'Estoque' },
                    { key: 'admin', label: 'Admin' },
                  ].map(area => (
                    <label key={area.key} className="flex items-center gap-2">
                      <input type="checkbox" checked={form.access_areas.includes(area.key)} onChange={() => toggleAccess(area.key)} />
                      {area.label}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={saveEmployee} className="w-full bg-cyan-600 text-white py-3 rounded-lg font-bold">Cadastrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CashFlowTab({ cashFlow, setCashFlow }: { cashFlow: CashFlow[]; setCashFlow: (c: CashFlow[]) => void }) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ amount: 0, description: '', type: 'saída' as 'entrada' | 'saída' })

  const now = new Date()
  const filtered = cashFlow.filter(c => {
    const date = c.created_at ? new Date(c.created_at) : new Date()
    if (period === 'today') return date.toDateString() === now.toDateString()
    if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return date >= weekAgo
    }
    if (period === 'month') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    }
    return true
  })

  const totalEntrada = filtered.filter(c => c.type === 'entrada').reduce((s, c) => s + c.amount, 0)
  const totalSaida = filtered.filter(c => c.type === 'saída').reduce((s, c) => s + c.amount, 0)
  const saldo = totalEntrada - totalSaida

  const saveExpense = () => {
    if (!form.description || form.amount <= 0) {
      toast.error('Preencha os campos')
      return
    }
    const newFlow: CashFlow = {
      id: Date.now().toString(),
      type: form.type,
      amount: form.amount,
      description: form.description,
      created_at: new Date().toISOString()
    }
    const updated = [newFlow, ...cashFlow]
    setCashFlow(updated)
    localStorage.setItem('khrismir_cashflow', JSON.stringify(updated))
    toast.success('Movimentação registrada!')
    setShowForm(false)
    setForm({ amount: 0, description: '', type: 'saída' })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Fluxo de Caixa</h2>
        <button onClick={() => setShowForm(true)} className="bg-cyan-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova Despesa
        </button>
      </div>

      <div className="flex gap-2">
        {(['today', 'week', 'month'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-lg ${period === p ? 'bg-cyan-600 text-white' : 'bg-white'}`}>
            {p === 'today' ? 'Hoje' : p === 'week' ? 'Esta Semana' : 'Este Mês'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-green-600 text-sm">Entradas</p>
          <p className="text-2xl font-bold text-green-600">{totalEntrada.toLocaleString('pt-AO')} AOA</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-600 text-sm">Saídas</p>
          <p className="text-2xl font-bold text-red-600">{totalSaida.toLocaleString('pt-AO')} AOA</p>
        </div>
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
          <p className="text-cyan-600 text-sm">Saldo</p>
          <p className="text-2xl font-bold text-cyan-600">{saldo.toLocaleString('pt-AO')} AOA</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Data</th>
              <th className="px-4 py-3 text-left">Descrição</th>
              <th className="px-4 py-3 text-right">Tipo</th>
              <th className="px-4 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(cf => (
              <tr key={cf.id} className="border-t">
                <td className="px-4 py-3 text-sm">{cf.created_at ? new Date(cf.created_at).toLocaleString('pt-AO') : '-'}</td>
                <td className="px-4 py-3">{cf.description}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`px-2 py-1 rounded text-xs ${cf.type === 'entrada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {cf.type}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right font-bold ${cf.type === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                  {cf.type === 'entrada' ? '+' : '-'}{cf.amount.toLocaleString('pt-AO')} AOA
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-xl mb-4">Nova Despesa</h3>
            <div className="space-y-4">
              <input type="text" placeholder="Descrição" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full p-2 border rounded-lg" />
              <input type="number" placeholder="Valor" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className="w-full p-2 border rounded-lg" />
              <div className="flex gap-2">
                <button onClick={() => setForm({ ...form, type: 'saída' })} className={`flex-1 p-2 rounded-lg ${form.type === 'saída' ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>Despesa</button>
                <button onClick={() => setForm({ ...form, type: 'entrada' })} className={`flex-1 p-2 rounded-lg ${form.type === 'entrada' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>Entrada</button>
              </div>
              <button onClick={saveExpense} className="w-full bg-cyan-600 text-white py-2 rounded-lg">Registar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReportsTab({ orders }: { orders: Order[] }) {
  const [period, setPeriod] = useState<'diario' | 'semanal' | 'mensal' | 'trimestral' | 'anual'>('diario')
  
  const now = new Date()
  const filteredOrders = orders.filter(order => {
    const orderDate = new Date(order.created_at)
    switch (period) {
      case 'diario':
        return orderDate.toDateString() === now.toDateString()
      case 'semanal': {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        return orderDate >= weekAgo
      }
      case 'mensal':
        return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear()
      case 'trimestral': {
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
        return orderDate >= quarterStart
      }
      case 'anual':
        return orderDate.getFullYear() === now.getFullYear()
      default:
        return true
    }
  })

  const totalSales = filteredOrders.reduce((s, o) => s + o.total, 0)
  const avgTicket = filteredOrders.length > 0 ? totalSales / filteredOrders.length : 0

  const byPayment = filteredOrders.reduce((acc, o) => {
    acc[o.payment_type] = (acc[o.payment_type] || 0) + o.total
    return acc
  }, {} as Record<string, number>)

  // Products most sold
  const productSales: Record<string, number> = {}
  filteredOrders.forEach(order => {
    order.items?.forEach(item => {
      productSales[item.product_name] = (productSales[item.product_name] || 0) + (item.quantity * item.unit_price)
    })
  })
  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Chart data based on period
  let chartLabels: string[] = []
  let chartValues: number[] = []
  
  if (period === 'diario') {
    chartLabels = Array.from({ length: 24 }, (_, i) => `${i}h`)
    chartValues = chartLabels.map(label => {
      const hour = parseInt(label)
      const hourOrders = filteredOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate.getHours() === hour
      })
      return hourOrders.reduce((s, o) => s + o.total, 0)
    })
  } else if (period === 'semanal') {
    chartLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    chartValues = chartLabels.map((_, idx) => {
      const dayAgo = 6 - idx
      const date = new Date(now.getTime() - dayAgo * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const dayOrders = filteredOrders.filter(o => o.created_at?.startsWith(dateStr))
      return dayOrders.reduce((s, o) => s + o.total, 0)
    })
  } else if (period === 'mensal') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    chartLabels = Array.from({ length: Math.min(15, daysInMonth) }, (_, i) => `${i + 1}`)
    chartValues = chartLabels.map(label => {
      const day = parseInt(label)
      const dateStr = new Date(now.getFullYear(), now.getMonth(), day).toISOString().split('T')[0]
      const dayOrders = filteredOrders.filter(o => o.created_at?.startsWith(dateStr))
      return dayOrders.reduce((s, o) => s + o.total, 0)
    })
  } else if (period === 'trimestral') {
    chartLabels = ['Mês 1', 'Mês 2', 'Mês 3']
    chartValues = chartLabels.map((_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (2 - idx), 1)
      const monthOrders = filteredOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate.getMonth() === date.getMonth() && orderDate.getFullYear() === date.getFullYear()
      })
      return monthOrders.reduce((s, o) => s + o.total, 0)
    })
  } else if (period === 'anual') {
    chartLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    chartValues = chartLabels.map((_, idx) => {
      const monthOrders = filteredOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate.getMonth() === idx && orderDate.getFullYear() === now.getFullYear()
      })
      return monthOrders.reduce((s, o) => s + o.total, 0)
    })
  }

  const handleExportPDF = () => {
    const content = `
PEIXARIA KHRISMIR - RELATÓRIO DE VENDAS
Data: ${new Date().toLocaleDateString('pt-AO')}
==========================================

TOTAL VENDIDO: ${totalSales.toLocaleString('pt-AO')} AOA
TICKET MÉDIO: ${avgTicket.toLocaleString('pt-AO')} AOA
NÚMERO DE VENDAS: ${orders.length}

VENDAS POR FORMA DE PAGAMENTO:
${Object.entries(byPayment).map(([m, t]) => `- ${m}: ${t.toLocaleString('pt-AO')} AOA`).join('\n')}

TOP 5 PRODUTOS:
${topProducts.map(([p, v], i) => `${i+1}. ${p}: ${v.toLocaleString('pt-AO')} AOA`).join('\n')}

==========================================
NIF: 5001210092
Software Certificado: 284/AGT/2024
    `
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-vendas-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Relatório exportado com sucesso!')
  }

  const handleExportSAFT = () => {
    const saftContent = `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:UploadedFileSchema:2">
  <Header>
    <TaxRegistrationNumber>5001210092</TaxRegistrationNumber>
    <TaxEntity>Peixaria Khrismir</TaxEntity>
    <SoftwareCertificateNumber>284/AGT/2024</SoftwareCertificateNumber>
    <CompanyName>Peixaria Khrismir</CompanyName>
    <FiscalYear>${new Date().getFullYear()}</FiscalYear>
    <StartDate>${new Date().getFullYear()}-01-01</StartDate>
    <EndDate>${new Date().getFullYear()}-12-31</EndDate>
    <CurrencyCode>AOA</CurrencyCode>
  </Header>
  <SalesInvoices>
    ${orders.map((order) => `
    <Invoice>
      <InvoiceNo>PKH-${String(order.id).padStart(5, '0')}</InvoiceNo>
      <InvoiceDate>${order.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]}</InvoiceDate>
      <CustomerID>${order.customer_id || '999999999'}</CustomerID>
      <DocumentType>FR</DocumentType>
      <PaymentType>${order.payment_type || 'Numerario'}</PaymentType>
      <TaxPayable>0</TaxPayable>
      <NetTotal>${order.total}</NetTotal>
      <GrossTotal>${order.total}</GrossTotal>
    </Invoice>`).join('')}
  </SalesInvoices>
</AuditFile>`
    
    const blob = new Blob([saftContent], { type: 'text/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SAFT-AO-${new Date().toISOString().split('T')[0]}.xml`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Ficheiro SAFT-AO exportado com sucesso!')
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Relatórios</h2>
        <div className="flex gap-2">
          {(['diario', 'semanal', 'mensal', 'trimestral', 'anual'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-sm ${period === p ? 'bg-cyan-600 text-white' : 'bg-white'}`}
            >
              {p === 'diario' ? 'Diário' : p === 'semanal' ? 'Semanal' : p === 'mensal' ? 'Mensal' : p === 'trimestral' ? 'Trimestral' : 'Anual'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-gray-500 text-sm">Total Vendido</p>
          <p className="text-3xl font-bold text-cyan-600">{totalSales.toLocaleString('pt-AO')} AOA</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-gray-500 text-sm">Ticket Médio</p>
          <p className="text-3xl font-bold text-cyan-600">{avgTicket.toLocaleString('pt-AO')} AOA</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-gray-500 text-sm">Total de Vendas</p>
          <p className="text-3xl font-bold text-cyan-600">{orders.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="font-bold mb-4">Vendas por Forma de Pagamento</h3>
        {Object.keys(byPayment).length === 0 ? (
          <p className="text-gray-500">Nenhuma venda registada</p>
        ) : (
          Object.entries(byPayment).map(([method, total]) => (
            <div key={method} className="flex justify-between items-center py-2 border-b">
              <span className="capitalize">{method}</span>
              <span className="font-bold">{total.toLocaleString('pt-AO')} AOA</span>
            </div>
          ))
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="font-bold mb-4">Produtos Mais Vendidos</h3>
        {topProducts.length === 0 ? (
          <p className="text-gray-500">Nenhum produto vendido</p>
        ) : (
          topProducts.map(([product, value], idx) => (
            <div key={product} className="flex justify-between items-center py-2 border-b">
              <span>{idx + 1}. {product}</span>
              <span className="font-bold">{value.toLocaleString('pt-AO')} AOA</span>
            </div>
          ))
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="font-bold mb-4">Evolução de Vendas ({period.charAt(0).toUpperCase() + period.slice(1)})</h3>
        <div className="flex gap-2 items-end h-40">
          {chartValues.map((val, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center">
              <div 
                className="w-full bg-cyan-500 rounded-t" 
                style={{ height: `${Math.max(10, (val / Math.max(...chartValues.filter(v => v > 0), 1)) * 100)}%` }}
              />
              <span className="text-xs mt-1 truncate w-full text-center">{chartLabels[idx]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="font-bold mb-4">Exportação</h3>
        <div className="flex gap-4">
          <button 
            onClick={handleExportPDF}
            className="bg-cyan-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-cyan-700"
          >
            <Printer className="w-4 h-4" /> Exportar PDF
          </button>
          <button 
            onClick={handleExportSAFT}
            className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700"
          >
            <FileText className="w-4 h-4" /> Gerar SAFT-AO
          </button>
        </div>
      </div>
    </div>
  )
}

function AGTTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Acesso AGT</h2>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-green-100 p-2 rounded-full">
            <span className="text-2xl">✓</span>
          </div>
          <div>
            <p className="font-bold">Sistema Conectado à AGT</p>
            <p className="text-sm text-gray-500">Última comunicação: agora</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">NIF da Empresa</p>
            <p className="font-bold text-lg">5001210092</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Certificado</p>
            <p className="font-bold text-lg">284/AGT/2024</p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold">Configurações Fiscais</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Regime de IVA</label>
              <select className="w-full p-2 border rounded-lg">
                <option>Geral</option>
                <option>Simplificado</option>
                <option>Exclusão</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Modo de Transmissão</label>
              <select className="w-full p-2 border rounded-lg">
                <option>Tempo Real</option>
                <option>Diferido (SAFT)</option>
              </select>
            </div>
          </div>

          <button className="w-full bg-cyan-600 text-white py-3 rounded-lg font-bold">
            Validar Comunicação
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Configurações da Loja</h2>

      <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nome da Loja</label>
          <input type="text" defaultValue="Peixaria Khrismir" className="w-full p-2 border rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Morada</label>
          <input type="text" defaultValue="Centralidade da Quilemba, Lubango, Huíla" className="w-full p-2 border rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Telefone 1</label>
            <input type="tel" defaultValue="929 970 984" className="w-full p-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Telefone 2</label>
            <input type="tel" defaultValue="924 359 638" className="w-full p-2 border rounded-lg" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">WhatsApp</label>
          <input type="tel" defaultValue="929 970 984" className="w-full p-2 border rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">NIF</label>
          <input type="text" defaultValue="5001210092" className="w-full p-2 border rounded-lg" />
        </div>
        <button className="w-full bg-cyan-600 text-white py-3 rounded-lg font-bold">Guardar Alterações</button>
      </div>
    </div>
  )
}

function SystemTab({ categories, products }: { categories: Category[]; products: Product[] }) {
  const handleReset = () => {
    if (!confirm('⚠️ Tem a certeza que deseja APAGAR TODOS OS DADOS? Esta ação não pode ser desfeita.')) return
    if (!confirm('Confirme novamente o reset total...')) return
    
    localStorage.clear()
    window.location.reload()
    toast.success('Dados resetados!')
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls,.csv'
    input.onchange = async () => {
      toast.success('Funcionalidade de importação em desenvolvimento')
    }
    input.click()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Sistema</h2>

      <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
        <h3 className="font-bold">Gestão de Dados</h3>
        
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="font-medium text-yellow-800">⚠️ Atenção</p>
          <p className="text-sm text-yellow-700">Estas operações são irreversíveis. Faça um backup se necessário.</p>
        </div>

        <div className="flex gap-4">
          <button onClick={handleImport} className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">
            <Database className="w-5 h-5" /> Importar Excel
          </button>
          <button onClick={handleReset} className="flex-1 bg-red-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">
            <Trash2 className="w-5 h-5" /> Reset Total
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="font-bold mb-4">Informações do Sistema</h3>
        <div className="space-y-2 text-sm">
          <p><strong>Versão:</strong> 1.0.0</p>
          <p><strong>Database:</strong> LocalStorage (Simulado)</p>
          <p><strong>Produtos:</strong> {products.length}</p>
          <p><strong>Categorias:</strong> {categories.length}</p>
        </div>
      </div>
    </div>
  )
}

type PurchaseType = 'fornecedor' | 'interno'

interface PurchaseItem {
  name: string
  quantity: number
  unitPrice: number
  total?: number
}

interface Purchase {
  id: string
  date: string
  type: PurchaseType
  supplier: string
  items: PurchaseItem[]
  total: number
  paymentType: string
  notes: string
}

function PurchasesTab({ products, setProducts, cashFlow, setCashFlow }: { 
  products: Product[]; 
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  cashFlow: CashFlow[];
  setCashFlow: React.Dispatch<React.SetStateAction<CashFlow[]>>;
}) {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    type: 'fornecedor' as PurchaseType,
    supplier: '',
    paymentType: 'Dinheiro',
    notes: '',
    items: [{ name: '', quantity: 1, unitPrice: 0, total: 0 }]
  })

  useEffect(() => {
    const stored = localStorage.getItem('khrismir_purchases')
    if (stored) setPurchases(JSON.parse(stored))
  }, [])

  const savePurchases = (newPurchases: Purchase[]) => {
    setPurchases(newPurchases)
    localStorage.setItem('khrismir_purchases', JSON.stringify(newPurchases))
  }

  const addPurchase = () => {
    const total = formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
    const newPurchase: Purchase = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      type: formData.type,
      supplier: formData.supplier,
      items: formData.items,
      total,
      paymentType: formData.paymentType,
      notes: formData.notes
    }

    const updatedPurchases = [...purchases, newPurchase]
    savePurchases(updatedPurchases)

    // Update stock
    const updatedProducts = [...products]
    formData.items.forEach(item => {
      const product = updatedProducts.find(p => p.name.toLowerCase() === item.name.toLowerCase())
      if (product) {
        product.stock_quantity += item.quantity
      }
    })
    setProducts(updatedProducts)
    localStorage.setItem('khrismir_products', JSON.stringify(updatedProducts))

    // Add to cash flow as expense
    const newCashFlow: CashFlow = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      type: 'saída',
      description: `Compra: ${formData.supplier}`,
      amount: total,
      paymentType: formData.paymentType,
      orderId: newPurchase.id
    }
    const updatedCashFlow = [...cashFlow, newCashFlow]
    setCashFlow(updatedCashFlow)
    localStorage.setItem('khrismir_cashflow', JSON.stringify(updatedCashFlow))

    setShowForm(false)
    setFormData({
      type: 'fornecedor',
      supplier: '',
      paymentType: 'Dinheiro',
      notes: '',
      items: [{ name: '', quantity: 1, unitPrice: 0, total: 0 }]
    })
    toast.success('Compra registada com sucesso!')
  }

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { name: '', quantity: 1, unitPrice: 0, total: 0 }]
    })
  }

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    })
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], [field]: value }
    setFormData({ ...formData, items: newItems })
  }

  const totalPurchase = formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gestão de Compras</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-cyan-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nova Compra
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-gray-500 text-sm">Total de Compras</p>
          <p className="text-3xl font-bold text-red-600">
            {purchases.reduce((s, p) => s + p.total, 0).toLocaleString('pt-AO')} AOA
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-gray-500 text-sm">Compras de Fornecedores</p>
          <p className="text-3xl font-bold text-cyan-600">
            {purchases.filter(p => p.type === 'fornecedor').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-gray-500 text-sm">Despesas Internas</p>
          <p className="text-3xl font-bold text-orange-600">
            {purchases.filter(p => p.type === 'interno').length}
          </p>
        </div>
      </div>

      {/* Purchases List */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">Data</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Tipo</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Fornecedor/Descrição</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Itens</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Total</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Nenhuma compra registada
                </td>
              </tr>
            ) : (
              purchases.slice().reverse().map(purchase => (
                <tr key={purchase.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{new Date(purchase.date).toLocaleDateString('pt-AO')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      purchase.type === 'fornecedor' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                    }`}>
                      {purchase.type === 'fornecedor' ? 'Fornecedor' : 'Interno'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{purchase.supplier}</td>
                  <td className="px-4 py-3 text-sm">{purchase.items.length} item(s)</td>
                  <td className="px-4 py-3 text-sm font-bold text-red-600">{purchase.total.toLocaleString('pt-AO')} AOA</td>
                  <td className="px-4 py-3 text-sm">{purchase.paymentType}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Purchase Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Nova Compra</h3>
                <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Tipo de Compra</label>
                    <select
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value as PurchaseType })}
                      className="w-full p-2 border rounded-lg"
                    >
                      <option value="fornecedor">Fornecedor</option>
                      <option value="interno">Despesa Interna</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Forma de Pagamento</label>
                    <select
                      value={formData.paymentType}
                      onChange={e => setFormData({ ...formData, paymentType: e.target.value })}
                      className="w-full p-2 border rounded-lg"
                    >
                      <option>Dinheiro</option>
                      <option>Multicaixa</option>
                      <option>Transferência</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {formData.type === 'fornecedor' ? 'Fornecedor' : 'Descrição da Despesa'}
                  </label>
                  <input
                    type="text"
                    value={formData.supplier}
                    onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    placeholder={formData.type === 'fornecedor' ? 'Nome do fornecedor' : 'Ex: Material de escritório'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notas</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    rows={2}
                    placeholder="Observações adicionais..."
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium">Itens</label>
                    <button onClick={addItem} className="text-cyan-600 text-sm flex items-center gap-1">
                      <Plus className="w-4 h-4" /> Adicionar Item
                    </button>
                  </div>
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex gap-2 mb-2 items-end">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => updateItem(index, 'name', e.target.value)}
                          className="w-full p-2 border rounded-lg text-sm"
                          placeholder="Nome do produto"
                          list="product-names"
                        />
                        <datalist id="product-names">
                          {products.map(p => (
                            <option key={p.id} value={p.name} />
                          ))}
                        </datalist>
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                          className="w-full p-2 border rounded-lg text-sm"
                          placeholder="Qtd"
                          min="1"
                        />
                      </div>
                      <div className="w-28">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={e => updateItem(index, 'unitPrice', Number(e.target.value))}
                          className="w-full p-2 border rounded-lg text-sm"
                          placeholder="Preço"
                          min="0"
                        />
                      </div>
                      <button
                        onClick={() => removeItem(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-center">
                  <span className="font-medium">Total:</span>
                  <span className="text-2xl font-bold text-red-600">{totalPurchase.toLocaleString('pt-AO')} AOA</span>
                </div>

                <button
                  onClick={addPurchase}
                  disabled={!formData.supplier || formData.items.length === 0}
                  className="w-full bg-cyan-600 text-white py-3 rounded-lg font-medium hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Registar Compra
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
