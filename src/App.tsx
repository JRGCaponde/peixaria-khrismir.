import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuthStore } from './stores/useAuthStore'
import { useState, useEffect } from 'react'
import { isAppActive, syncLicenseFromCloud } from './lib/license'
import { StoreProvider, useStore } from './lib/storeContext'

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
import VoiceAssistant from './pages/VoiceAssistant'
import SmartHome from './pages/SmartHome'
import Activation from './pages/Activation'
import StorePicker from './pages/StorePicker'

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
  const { isAuthenticated, user } = useAuthStore()
  const [appActive, setAppActive] = useState(() => isAppActive())

  useEffect(() => {
    syncLicenseFromCloud().then(() => setAppActive(isAppActive()))
  }, [])

  if (!appActive) {
    return <Activation onActivated={() => setAppActive(true)} />
  }

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
              <Route path="/assistente" element={<StaffRoute><VoiceAssistant /></StaffRoute>} />
              <Route path="/casa" element={<StaffRoute><SmartHome /></StaffRoute>} />

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
    <StoreProvider>
      <AppInner />
    </StoreProvider>
  )
}
