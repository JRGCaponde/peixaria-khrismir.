import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import CryptoJS from 'crypto-js'
import { supabase, isSupabaseReady } from '../lib/supabase'
import { startPresenceTracking, stopPresenceTracking } from '../lib/presence'

interface User {
  id: string
  email: string
  full_name: string
  phone?: string
  role: 'admin' | 'employee' | 'gerente' | 'client' | 'super_admin'
  access_areas?: string[]   // tabs que o gerente pode aceder
  created_at: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; lockedUntil?: number }>
  logout: () => Promise<void>
  requestReset: (email: string) => string | null
  resetPassword: (email: string, newPassword: string, code: string) => boolean
  initSupabaseSession: () => Promise<void>
  createUser: (email: string, password: string, fullName: string, phone: string, role: 'employee' | 'admin' | 'gerente' | 'client' | 'super_admin', access_areas?: string[]) => Promise<{ ok: boolean; supabaseId?: string; error?: string }>
}

// ── Bloqueio de tentativas (local) ─────────────────────────────
const MAX_ATTEMPTS = 5
const LOCK_MS = 15 * 60 * 1000

function getAttempts(): Record<string, { count: number; since: number }> {
  try { return JSON.parse(localStorage.getItem('khrismir_login_attempts') || '{}') } catch { return {} }
}
function saveAttempts(a: Record<string, { count: number; since: number }>) {
  localStorage.setItem('khrismir_login_attempts', JSON.stringify(a))
}
function clearAttempts(email: string) {
  const a = getAttempts(); delete a[email.toLowerCase()]; saveAttempts(a)
}

// ── Utilizadores padrão localStorage ──────────────────────────
export function ensureDefaultUsers() {
  const defaults = [
    { id: 'admin-khrismir-001',    email: 'admin@khrismir.ao',       password: CryptoJS.SHA256('admin123').toString(), full_name: 'Administrador',     phone: '+244 929 970 984', role: 'admin',    created_at: '2025-01-01T00:00:00.000Z' },
    { id: 'employee-khrismir-001', email: 'funcionario@khrismir.ao', password: CryptoJS.SHA256('func123').toString(),  full_name: 'Funcionário Padrão', phone: '',                  role: 'employee', created_at: '2025-01-01T00:00:00.000Z' },
  ]
  const stored: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]')
  let changed = false
  for (const d of defaults) {
    if (!stored.find((u: any) => u.id === d.id)) { stored.push(d); changed = true }
  }
  if (changed) localStorage.setItem('khrismir_clients', JSON.stringify(stored))

  const emps: any[] = JSON.parse(localStorage.getItem('khrismir_employees') || '[]')
  let empChanged = false
  for (const d of defaults) {
    if (!emps.find((u: any) => u.id === d.id)) { emps.push(d); empChanged = true }
  }
  if (empChanged) localStorage.setItem('khrismir_employees', JSON.stringify(emps))
}
ensureDefaultUsers()

// ── Store ──────────────────────────────────────────────────────
export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      user: null,
      isAuthenticated: false,

      // Restaurar sessão Supabase ao abrir o app
      initSupabaseSession: async () => {
        if (!isSupabaseReady() || !supabase) return
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
        if (profile) {
          const u: User = { id: session.user.id, email: session.user.email!, full_name: profile.full_name, phone: profile.phone, role: profile.role, access_areas: profile.access_areas, created_at: profile.created_at }
          set({ user: u, isAuthenticated: true })
          startPresenceTracking(u)
          // Auto-definir a loja activa a partir do perfil (resolve getCurrentStoreId() null)
          if (profile.store_id) {
            try {
              const existing = JSON.parse(localStorage.getItem('khrismir_current_store') || 'null')
              if (!existing || existing.id !== profile.store_id) {
                const { data: storeData } = await supabase.from('stores').select('*').eq('id', profile.store_id).maybeSingle()
                const storeObj = storeData ?? { id: profile.store_id, name: 'Loja Khrismir' }
                localStorage.setItem('khrismir_current_store', JSON.stringify(storeObj))
              }
            } catch { /* non-fatal */ }
          }
        }
      },

      login: async (email, password) => {
        const key = email.toLowerCase()
        const attempts = getAttempts()
        const entry = attempts[key]

        // Verificar bloqueio local
        if (entry && entry.count >= MAX_ATTEMPTS) {
          const elapsed = Date.now() - entry.since
          if (elapsed < LOCK_MS) return { ok: false, lockedUntil: entry.since + LOCK_MS }
          delete attempts[key]; saveAttempts(attempts)
        }

        const recordFail = () => {
          const now = Date.now()
          attempts[key] = { count: (attempts[key]?.count ?? 0) + 1, since: attempts[key]?.since ?? now }
          saveAttempts(attempts)
        }

        // ── Via Supabase Auth (quando configurado) ──
        if (isSupabaseReady() && supabase) {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password })
          if (!error && data.session) {
            let { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()

            // Se não encontrou perfil via RLS, tenta via service (bypass)
            if (!profile) {
              const { data: p2 } = await supabase
                .from('profiles').select('*').eq('email', data.user.email!).maybeSingle()
              if (p2) profile = p2
            }

            // Se ainda não tem perfil, cria um automaticamente (INSERT nunca sobrescreve role existente)
            if (!profile) {
              const newProfile = {
                id: data.user.id,
                email: data.user.email!,
                full_name: data.user.user_metadata?.full_name ?? data.user.email!,
                role: 'client' as const,
                created_at: new Date().toISOString(),
              }
              const { error: insertErr } = await supabase.from('profiles').insert(newProfile)
              if (insertErr) {
                // Perfil já existe mas o SELECT falhou (ex: RLS transitória) — tentar novamente
                const { data: p3 } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
                profile = p3 ?? newProfile
              } else {
                profile = newProfile
              }
            }

            clearAttempts(email)
            const u: User = {
              id: data.user.id,
              email: data.user.email!,
              full_name: profile?.full_name ?? data.user.email!,
              phone: profile?.phone,
              role: profile?.role ?? 'client',
              access_areas: profile?.access_areas,
              created_at: profile?.created_at ?? new Date().toISOString(),
            }
            set({ user: u, isAuthenticated: true })
            startPresenceTracking(u)
            // Auto-definir a loja activa a partir do perfil (resolve getCurrentStoreId() null)
            if (profile?.store_id) {
              try {
                const existing = JSON.parse(localStorage.getItem('khrismir_current_store') || 'null')
                if (!existing || existing.id !== profile.store_id) {
                  const { data: storeData } = await supabase!.from('stores').select('*').eq('id', profile.store_id).maybeSingle()
                  const storeObj = storeData ?? { id: profile.store_id, name: 'Loja Khrismir' }
                  localStorage.setItem('khrismir_current_store', JSON.stringify(storeObj))
                }
              } catch { /* non-fatal */ }
            }
            return { ok: true }
          }
          // Supabase falhou — tentar localStorage como fallback (utilizadores locais: admin, funcionários)
        }

        // ── Via localStorage (sem Supabase ou fallback para utilizadores locais) ──
        ensureDefaultUsers()
        const clients: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]')
        const hashed = CryptoJS.SHA256(password).toString()
        const found = clients.find((u: any) => u.email.toLowerCase() === key && u.password === hashed)
        if (!found) { recordFail(); return { ok: false } }
        clearAttempts(email)
        const { password: _pw, ...safe } = found
        set({ user: safe as User, isAuthenticated: true })
        startPresenceTracking(safe as User)
        return { ok: true }
      },

      logout: async () => {
        stopPresenceTracking()
        if (isSupabaseReady() && supabase) await supabase.auth.signOut()
        set({ user: null, isAuthenticated: false })
      },

      requestReset: (email) => {
        // Com Supabase: usar supabase.auth.resetPasswordForEmail
        if (isSupabaseReady() && supabase) {
          supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth?view=reset` })
          return '__supabase__'
        }
        const clients: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]')
        if (!clients.find((c: any) => c.email.toLowerCase() === email.toLowerCase())) return null
        const code = Math.floor(100000 + Math.random() * 900000).toString()
        const resets: Record<string, { code: string; expires: number }> = JSON.parse(localStorage.getItem('khrismir_resets') || '{}')
        resets[email.toLowerCase()] = { code, expires: Date.now() + 30 * 60 * 1000 }
        localStorage.setItem('khrismir_resets', JSON.stringify(resets))
        return code
      },

      resetPassword: (email, newPassword, code) => {
        const resets: Record<string, { code: string; expires: number }> = JSON.parse(localStorage.getItem('khrismir_resets') || '{}')
        const entry = resets[email.toLowerCase()]
        if (!entry || entry.code !== code || Date.now() > entry.expires) return false
        const clients: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]')
        const idx = clients.findIndex((c: any) => c.email.toLowerCase() === email.toLowerCase())
        if (idx === -1) return false
        clients[idx].password = CryptoJS.SHA256(newPassword).toString()
        localStorage.setItem('khrismir_clients', JSON.stringify(clients))
        delete resets[email.toLowerCase()]
        localStorage.setItem('khrismir_resets', JSON.stringify(resets))
        clearAttempts(email)
        return true
      },

      createUser: async (email, password, fullName, phone, role, access_areas) => {
        let supabaseId: string | undefined

        // Tenta criar utilizador no Supabase Auth usando um cliente temporário
        // (cliente isolado para não afectar a sessão do admin actual)
        if (isSupabaseReady() && supabase) {
          try {
            const { createClient } = await import('@supabase/supabase-js')
            const tempClient = createClient(
              import.meta.env.VITE_SUPABASE_URL,
              import.meta.env.VITE_SUPABASE_ANON_KEY,
              { auth: { storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } as any } }
            )
            const { data, error } = await tempClient.auth.signUp({
              email,
              password,
              options: { data: { full_name: fullName, role } },
            })
            if (!error && data.user) {
              supabaseId = data.user.id
              await supabase.from('profiles').upsert({
                id: data.user.id,
                email,
                full_name: fullName,
                phone: phone || null,
                role,
                access_areas: access_areas ?? null,
                created_at: new Date().toISOString(),
              }, { onConflict: 'id' })
            }
          } catch (err: any) {
            // non-fatal — continua com criação local
          }
        }

        // Cria sempre em localStorage como fallback/offline
        const hashed = CryptoJS.SHA256(password).toString()
        const newUser: any = {
          id: supabaseId ?? `local-${Date.now()}`,
          full_name: fullName,
          email,
          phone: phone || '',
          password: hashed,
          role,
          access_areas: access_areas ?? [],
          created_at: new Date().toISOString(),
          supabase_synced: !!supabaseId,
        }
        const clients: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]')
        localStorage.setItem('khrismir_clients', JSON.stringify([...clients, newUser]))
        if (role === 'employee' || role === 'admin' || role === 'gerente') {
          const emps: any[] = JSON.parse(localStorage.getItem('khrismir_employees') || '[]')
          localStorage.setItem('khrismir_employees', JSON.stringify([...emps, newUser]))
        }
        return { ok: true, supabaseId }
      },
    }),
    { name: 'khrismir_auth_storage' },
  ),
)

// Ouvir alterações de sessão Supabase (ex: refresh de token)
if (isSupabaseReady() && supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      useAuthStore.setState({ user: null, isAuthenticated: false })
    }
  })
}
