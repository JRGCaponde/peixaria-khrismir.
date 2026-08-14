import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { useAuthStore } from './stores/useAuthStore'
import { useEffect, useRef, Component, type ReactNode } from 'react'
import { StoreProvider, useStore } from './lib/storeContext'

// ── Bloqueio automático por inactividade ──────────────────────────
const IDLE_LIMIT_MS = 30 * 60 * 1000 // 30 minutos
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

function useIdleLogout(isAuthenticated: boolean, logout: () => Promise<void>) {
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    if (!isAuthenticated) return

    const markActivity = () => { lastActivity.current = Date.now() }
    markActivity()
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, markActivity, { passive: true }))

    const interval = setInterval(() => {
      if (Date.now() - lastActivity.current >= IDLE_LIMIT_MS) {
        logout()
        toast.info('Sessão bloqueada por inactividade — introduza as suas credenciais.')
      }
    }, 30_000)

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, markActivity))
      clearInterval(interval)
    }
  }, [isAuthenticated, logout])
}

// ── Error Boundary — evita white screen se um componente falhar ──
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
            <div className="text-5xl">🐟</div>
            <h2 className="text-xl font-bold text-gray-800">Algo correu mal</h2>
            <p className="text-sm text-gray-500 font-mono bg-gray-100 p-3 rounded-lg text-left break-all">
              {(this.state.error as Error).message}
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload() }}
              className="w-full py-2.5 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700"
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Páginas
import Header     from './components/Header'
import Landing    from './pages/Landing'
import Auth       from './pages/Auth'
import Catalog    from './pages/Catalog'
import Cart       from './pages/Cart'
import Orders     from './pages/Orders'
import POS        from './pages/POS'
import Admin      from './pages/Admin'
import Verify     from './pages/Verify'
import Profile    from './pages/Profile'
import CashFlow   from './pages/CashFlow'
import StorePicker   from './pages/StorePicker'

// --- PROTECÇÃO DE ROTAS ---

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth" replace />
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore()
  if (!isAuthenticated)          return <Navigate to="/auth"    replace />
  if (user?.role === 'client')   return <Navigate to="/catalog" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  if (user?.role === 'admin' || user?.role === 'gerente' || user?.role === 'super_admin') return <>{children}</>
  return <Navigate to={user?.role === 'employee' ? '/pos' : '/catalog'} replace />
}

// --- GUARDA DE LOJA ---
// Utilizadores autenticados precisam de ter uma loja seleccionada antes de entrar
function StoreGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore()
  const { store } = useStore()

  if (!isAuthenticated) return <>{children}</>

  // Clientes não precisam de seleccionar loja
  if (user?.role === 'client') return <>{children}</>

  // Staff sem loja seleccionada → ecrã de selecção
  if (!store) return <StorePicker />

  return <>{children}</>
}

// --- APP PRINCIPAL ---

function AppInner() {
  const { isAuthenticated, user, logout } = useAuthStore()

  useIdleLogout(isAuthenticated, logout)

  const getHomeRoute = () => {
    if (user?.role === 'super_admin') return '/admin'
    if (user?.role === 'admin' || user?.role === 'gerente') return '/admin'
    if (user?.role === 'employee') return '/pos'
    return '/catalog'
  }

  return (
    <Router>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50">
        <StoreGuard>
          <Header />
          <main className="container mx-auto py-3 sm:py-6 px-3 sm:px-4 md:px-8">
            <Routes>
              {/* Públicas */}
              <Route path="/"       element={<Landing />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/auth"   element={!isAuthenticated ? <Auth /> : <Navigate to={getHomeRoute()} replace />} />

              {/* Cliente */}
              <Route path="/catalog" element={<Protected><Catalog /></Protected>} />
              <Route path="/cart"    element={<Protected><Cart /></Protected>} />
              <Route path="/orders"  element={<Protected><Orders /></Protected>} />
              <Route path="/profile" element={<Protected><Profile /></Protected>} />

              {/* Staff */}
              <Route path="/pos" element={<StaffRoute><POS /></StaffRoute>} />

              {/* Admin */}
              <Route path="/admin/*"  element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="/cashflow" element={<StaffRoute><CashFlow /></StaffRoute>} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to={isAuthenticated ? getHomeRoute() : '/'} replace />} />
            </Routes>
          </main>
        </StoreGuard>
      </div>
    </Router>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <AppInner />
      </StoreProvider>
    </ErrorBoundary>
  )
}
