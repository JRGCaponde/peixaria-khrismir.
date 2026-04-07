import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuthStore } from './stores/useAuthStore'
import Header from './components/Header'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Catalog from './pages/Catalog'
import Cart from './pages/Cart'
import Orders from './pages/Orders'
import POS from './pages/POS'
import Admin from './pages/Admin'
import Verify from './pages/Verify'

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth" />
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/auth" />
  if (user?.role === 'client') return <Navigate to="/catalog" />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/auth" />
  if (user?.role !== 'admin') return <Navigate to="/pos" />
  return <>{children}</>
}

export default function App() {
  return (
    <Router>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50">
        <Header />
        <main className="container mx-auto py-6 px-4 md:px-8">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/catalog" element={<Protected><Catalog /></Protected>} />
            <Route path="/cart" element={<Protected><Cart /></Protected>} />
            <Route path="/orders" element={<Protected><Orders /></Protected>} />
            <Route path="/pos" element={<StaffRoute><POS /></StaffRoute>} />
            <Route path="/admin/*" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/verify" element={<Verify />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}
