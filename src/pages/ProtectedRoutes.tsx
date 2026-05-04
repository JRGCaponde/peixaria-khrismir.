import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'

type Role = 'client' | 'employee' | 'admin'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: Role[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role as Role)) {
    const homeRoute =
      user.role === 'admin' ? '/admin'
      : user.role === 'employee' ? '/pos'
      : '/catalog'

    return <Navigate to={homeRoute} replace />
  }

  return <>{children}</>
}

// --- COMPONENTES ESPECÍFICOS ---

export function StaffRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute 
      children={children} 
      allowedRoles={['employee', 'admin']} 
    />
  )
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute 
      children={children} 
      allowedRoles={['admin']} 
    />
  )
}
