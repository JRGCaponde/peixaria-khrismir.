import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, UserRole, Employee } from '../types/database'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => boolean
  logout: () => void
  hasRole: (role: UserRole) => boolean
  hasAccess: (area: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      
      login: (email: string, password: string) => {
        // Admin fixo
        if (email === 'jorgeamaral2009@gmail.com' && password === 'podescre0') {
          set({
            user: {
              id: '1',
              email: 'jorgeamaral2009@gmail.com',
              full_name: 'Jorge Amaral',
              phone: '929970984',
              role: 'admin',
              access_areas: ['all']
            },
            isAuthenticated: true
          })
          return true
        }
        
        // Verificar funcionários cadastrados
        const storedEmployees = localStorage.getItem('khrismir_employees')
        if (storedEmployees) {
          const employees = JSON.parse(storedEmployees)
          const emp = employees.find((e: Employee) => e.email === email && e.password === password)
          if (emp) {
            const { password: _, ...userWithoutPassword } = emp
            set({ user: userWithoutPassword as User, isAuthenticated: true })
            return true
          }
        }
        
        // Verificar clientes cadastrados
        const storedClients = localStorage.getItem('khrismir_clients')
        if (storedClients) {
          const clients = JSON.parse(storedClients)
          const client = clients.find((c: any) => c.email === email && c.password === password)
          if (client) {
            const { password: _, ...userWithoutPassword } = client
            set({ user: userWithoutPassword as User, isAuthenticated: true })
            return true
          }
        }
        
        // Clientes demo
        if (email === 'cliente@peixaria.com' && password === '123456') {
          set({
            user: {
              id: '2',
              email: 'cliente@peixaria.com',
              full_name: 'Cliente Demo',
              phone: '921000000',
              role: 'client'
            },
            isAuthenticated: true
          })
          return true
        }
        
        return false
      },
      
      logout: () => {
        set({ user: null, isAuthenticated: false })
      },
      
      hasRole: (role: UserRole) => {
        const { user } = get()
        return user?.role === role
      },
      
      hasAccess: (area: string) => {
        const { user } = get()
        if (!user) return false
        if (user.role === 'admin') return true
        if (user.access_areas?.includes('all')) return true
        return user.access_areas?.includes(area) ?? false
      }
    }),
    { name: 'khrismir_auth' }
  )
)
