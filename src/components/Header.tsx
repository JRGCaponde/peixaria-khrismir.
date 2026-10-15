import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import { Fish, User, LogOut, Menu, X, Bell, Store, ChevronDown, PackageX } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { getPendingOrderCount, startOrderPolling, requestNotificationPermission } from '../lib/notifications'
import { useStore } from '../lib/storeContext'
import CloudStatus from './CloudStatus'
import type { Product } from '../types/database'

// Lê o stock baixo directamente do localStorage — visível a toda a
// equipa (incluindo funcionários, que não têm acesso ao painel Admin
// onde este alerta existia antes).
function readLowStock(): Product[] {
  try {
    const products: Product[] = JSON.parse(localStorage.getItem('khrismir_products') || '[]')
    return products.filter(p => p.stock_quantity <= p.min_stock)
  } catch { return [] }
}

export default function Header() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const { store, clearStore } = useStore()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [pendingOrders, setPendingOrders] = useState(0)
  const [lowStock, setLowStock] = useState<Product[]>([])

  useEffect(() => {
    if (!isAuthenticated || user?.role === 'client') return
    setPendingOrders(getPendingOrderCount())
    requestNotificationPermission()
    const stop = startOrderPolling(count => {
      setPendingOrders(count)
    })
    return stop
  }, [isAuthenticated, user?.role])

  useEffect(() => {
    if (!isAuthenticated || user?.role === 'client') return
    setLowStock(readLowStock())
    const handleSync = (e: Event) => {
      const table = (e as CustomEvent).detail?.table
      if (!table || table === 'products' || table === 'pullAll') setLowStock(readLowStock())
    }
    window.addEventListener('khrismir:sync', handleSync)
    // Reserva: caso o evento não dispare (ex: alteração feita noutro separador)
    const interval = setInterval(() => setLowStock(readLowStock()), 60000)
    return () => {
      window.removeEventListener('khrismir:sync', handleSync)
      clearInterval(interval)
    }
  }, [isAuthenticated, user?.role])

  const showLowStockList = () => {
    if (lowStock.length === 0) return
    const names = lowStock.slice(0, 8).map(p => `${p.name} (${p.stock_quantity} ${p.unit})`).join('\n')
    const extra = lowStock.length > 8 ? `\n… e mais ${lowStock.length - 8}` : ''
    toast.warning(`Stock baixo — ${lowStock.length} produto(s)`, {
      description: names + extra,
      duration: 8000,
    })
  }

  const handleLogout = () => {
    logout()
    clearStore()
    localStorage.removeItem('khrismir_cart')
    localStorage.removeItem('khrismir_pos_cart')
    navigate('/')
    setMobileMenuOpen(false)
  }

  return (
    <header className="bg-gradient-to-r from-cyan-700 via-cyan-600 to-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-full">
              <Fish className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">
                {store?.name ?? 'Peixaria Khrismir'}
              </h1>
              <p className="text-xs text-cyan-100">
                {store ? `NIF: ${store.nif || '—'}` : 'Frescor do Mar à sua Mesa'}
              </p>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-4">
            <Link to="/verify" className="hover:text-cyan-200 transition">Verificar Pedido</Link>
            
            {isAuthenticated ? (
              <>
                {user?.role !== 'client' && (
                  <>
                    <Link to="/pos" className="hover:text-cyan-200 transition">PDV</Link>
                    <Link to="/cashflow" className="hover:text-cyan-200 transition">Caixa</Link>
                    {(user?.role === 'admin' || user?.role === 'gerente' || user?.role === 'super_admin') && (
                      <Link to="/admin" className="hover:text-cyan-200 transition">Admin</Link>
                    )}
                  </>
                )}
                {user?.role === 'client' && (
                  <>
                    <Link to="/catalog" className="hover:text-cyan-200 transition">Catálogo</Link>
                    <Link to="/orders" className="hover:text-cyan-200 transition">Meus Pedidos</Link>
                  </>
                )}
                <div className="flex items-center gap-2 ml-4">
                  {user?.role !== 'client' && pendingOrders > 0 && (
                    <Link to="/admin" className="relative p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition" title={`${pendingOrders} encomenda(s) pendente(s)`}>
                      <Bell className="w-5 h-5" />
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-black rounded-full w-4 h-4 flex items-center justify-center">{pendingOrders > 9 ? '9+' : pendingOrders}</span>
                    </Link>
                  )}
                  {user?.role !== 'client' && lowStock.length > 0 && (
                    (user?.role === 'admin' || user?.role === 'gerente' || user?.role === 'super_admin') ? (
                      <Link to="/admin" className="relative p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition" title={`${lowStock.length} produto(s) com stock baixo`}>
                        <PackageX className="w-5 h-5" />
                        <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-black rounded-full w-4 h-4 flex items-center justify-center">{lowStock.length > 9 ? '9+' : lowStock.length}</span>
                      </Link>
                    ) : (
                      <button onClick={showLowStockList} className="relative p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition" title={`${lowStock.length} produto(s) com stock baixo — carregar para ver`}>
                        <PackageX className="w-5 h-5" />
                        <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-black rounded-full w-4 h-4 flex items-center justify-center">{lowStock.length > 9 ? '9+' : lowStock.length}</span>
                      </button>
                    )
                  )}
                  {user?.role !== 'client' && <CloudStatus />}
                  {/* Botão mudar loja (super_admin ou staff com acesso a múltiplas lojas) */}
                  {store && user?.role !== 'client' && (
                    <button
                      onClick={() => { clearStore(); navigate('/') }}
                      className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-lg text-xs transition"
                      title="Mudar de loja"
                    >
                      <Store className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline max-w-24 truncate">{store.name}</span>
                      <ChevronDown className="w-3 h-3 opacity-70" />
                    </button>
                  )}
                  <User className="w-4 h-4" />
                  <span className="text-sm">{user?.full_name}</span>
                  <button
                    onClick={handleLogout}
                    className="ml-2 bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm flex items-center gap-1"
                  >
                    <LogOut className="w-4 h-4" /> Sair
                  </button>
                </div>
              </>
            ) : (
              <Link
                to="/auth"
                className="bg-white text-cyan-700 hover:bg-cyan-50 px-4 py-2 rounded-lg font-medium transition"
              >
                Entrar
              </Link>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 -mr-2 rounded-lg hover:bg-white/10 transition"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden mt-4 pb-4 space-y-1 border-t border-white/20 pt-4">
            <Link to="/verify" className="block py-3 px-3 rounded-lg hover:bg-white/10 transition text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
              Verificar Pedido
            </Link>
            {isAuthenticated ? (
              <>
                {user?.role !== 'client' && (
                  <>
                    <Link to="/pos" className="block py-3 px-3 rounded-lg hover:bg-white/10 transition text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                      PDV
                    </Link>
                    <Link to="/cashflow" className="block py-3 px-3 rounded-lg hover:bg-white/10 transition text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                      Fluxo de Caixa
                    </Link>
                    {(user?.role === 'admin' || user?.role === 'gerente' || user?.role === 'super_admin') && (
                      <Link to="/admin" className="block py-3 px-3 rounded-lg hover:bg-white/10 transition text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                        Admin
                      </Link>
                    )}
                    {lowStock.length > 0 && (
                      <button
                        onClick={() => { showLowStockList(); setMobileMenuOpen(false) }}
                        className="w-full text-left py-3 px-3 rounded-lg hover:bg-white/10 transition text-sm font-medium flex items-center gap-2 text-orange-200"
                      >
                        <PackageX className="w-4 h-4" /> Stock baixo ({lowStock.length})
                      </button>
                    )}
                  </>
                )}
                {user?.role === 'client' && (
                  <>
                    <Link to="/catalog" className="block py-3 px-3 rounded-lg hover:bg-white/10 transition text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                      Catálogo
                    </Link>
                    <Link to="/orders" className="block py-3 px-3 rounded-lg hover:bg-white/10 transition text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                      Meus Pedidos
                    </Link>
                  </>
                )}
                <div className="border-t border-white/20 mt-2 pt-2">
                  {user?.role !== 'client' && (
                    <div className="px-3 py-2"><CloudStatus compact /></div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-cyan-100">
                    <User className="w-4 h-4" />
                    <span>{user?.full_name}</span>
                  </div>
                  <button onClick={handleLogout} className="w-full text-left py-3 px-3 rounded-lg hover:bg-red-500/20 transition text-sm font-medium text-red-200 flex items-center gap-2">
                    <LogOut className="w-4 h-4" /> Sair
                  </button>
                </div>
              </>
            ) : (
              <Link
                to="/auth"
                className="block py-3 bg-white text-cyan-700 px-4 rounded-xl text-center font-semibold mt-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Entrar
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  )
}
