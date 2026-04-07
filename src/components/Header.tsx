import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import { Fish, User, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'

export default function Header() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
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
              <h1 className="text-xl md:text-2xl font-bold">Peixaria Khrismir</h1>
              <p className="text-xs text-cyan-100">Frescor do Mar à sua Mesa</p>
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
                    {user?.role === 'admin' && (
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
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden mt-4 pb-4 space-y-2">
            <Link to="/verify" className="block py-2" onClick={() => setMobileMenuOpen(false)}>
              Verificar Pedido
            </Link>
            {isAuthenticated ? (
              <>
                {user?.role !== 'client' && (
                  <>
                    <Link to="/pos" className="block py-2" onClick={() => setMobileMenuOpen(false)}>
                      PDV
                    </Link>
                    {user?.role === 'admin' && (
                      <Link to="/admin" className="block py-2" onClick={() => setMobileMenuOpen(false)}>
                        Admin
                      </Link>
                    )}
                  </>
                )}
                {user?.role === 'client' && (
                  <>
                    <Link to="/catalog" className="block py-2" onClick={() => setMobileMenuOpen(false)}>
                      Catálogo
                    </Link>
                    <Link to="/orders" className="block py-2" onClick={() => setMobileMenuOpen(false)}>
                      Meus Pedidos
                    </Link>
                  </>
                )}
                <button onClick={handleLogout} className="block py-2 text-red-300">
                  Sair
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="block py-2 bg-white text-cyan-700 px-4 rounded text-center"
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
