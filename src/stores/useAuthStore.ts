import { create } from 'zustand'
import CryptoJS from 'crypto-js'
import { supabase, isSupabaseReady } from '../lib/supabase'
import { startPresenceTracking, stopPresenceTracking } from '../lib/presence'
import { getCurrentStoreId } from '../lib/storeContext'

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
  createUser: (email: string, password: string, fullName: string, phone: string, role: 'employee' | 'admin' | 'gerente' | 'client' | 'super_admin', access_areas?: string[]) => Promise<{ ok: boolean; supabaseId?: string; error?: string }>
  /**
   * Reconhece automaticamente um CLIENTE que já esteve logado neste dispositivo
   * (sessão Supabase persistida, ou fallback local) — facilita o acesso a quem
   * volta a usar a app depois de ler o QR code. Nunca restaura sessões de
   * funcionário/admin — essas continuam sempre a pedir credenciais.
   */
  restoreClientSession: () => Promise<void>
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
// SEM persistência: o utilizador tem sempre de introduzir as credenciais
// quando o app é aberto (arranque novo ou reload) — não há sessão
// automática guardada entre aberturas.
export const useAuthStore = create<AuthState>()(
    (set, _get) => ({
      user: null,
      isAuthenticated: false,

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
        const found = clients.find((u: any) => (u.email ?? '').toLowerCase() === key && u.password === hashed)
        if (!found) { recordFail(); return { ok: false } }
        clearAttempts(email)
        const { password: _pw, ...safe } = found
        set({ user: safe as User, isAuthenticated: true })
        startPresenceTracking(safe as User)
        // Guarda o id localmente para reconhecer automaticamente este cliente
        // da próxima vez que abrir a app neste dispositivo (ver restoreClientSession).
        if (safe.role === 'client') localStorage.setItem('khrismir_client_local_id', safe.id)
        return { ok: true }
      },

      logout: async () => {
        stopPresenceTracking()
        if (isSupabaseReady() && supabase) await supabase.auth.signOut()
        localStorage.removeItem('khrismir_client_local_id')
        set({ user: null, isAuthenticated: false })
      },

      restoreClientSession: async () => {
        if (isSupabaseReady() && supabase) {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
              if (profile?.role === 'client') {
                const u: User = {
                  id: session.user.id, email: session.user.email!, full_name: profile.full_name,
                  phone: profile.phone, role: profile.role, created_at: profile.created_at,
                }
                set({ user: u, isAuthenticated: true })
                startPresenceTracking(u)
                return
              }
              if (profile) return // sessão válida mas não é cliente (staff) — nunca auto-reconhecer
            }
          } catch { /* não fatal — tenta o fallback local a seguir */ }
        }
        // Fallback local (sem Supabase configurado, ou sem sessão activa)
        try {
          const localId = localStorage.getItem('khrismir_client_local_id')
          if (!localId) return
          const clients: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]')
          const found = clients.find((c: any) => c.id === localId && c.role === 'client')
          if (found) {
            const { password: _pw, ...safe } = found
            set({ user: safe as User, isAuthenticated: true })
            startPresenceTracking(safe as User)
          }
        } catch { /* non-fatal */ }
      },

      requestReset: (email) => {
        // Com Supabase: usar supabase.auth.resetPasswordForEmail
        if (isSupabaseReady() && supabase) {
          supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth?view=reset` })
          return '__supabase__'
        }
        const clients: any[] = JSON.parse(localStorage.getItem('khrismir_clients') || '[]')
        if (!clients.find((c: any) => (c.email ?? '').toLowerCase() === email.toLowerCase())) return null
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
        const idx = clients.findIndex((c: any) => (c.email ?? '').toLowerCase() === email.toLowerCase())
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
        let cloudError: string | undefined

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
            let { data, error } = await tempClient.auth.signUp({
              email,
              password,
              options: { data: { full_name: fullName, role } },
            })

            // "Já registado" acontece tipicamente quando o perfil foi apagado
            // (ex: um reset total) mas a conta de autenticação continua a existir.
            // Tenta autenticar com a password fornecida para recuperar o id e
            // reconstruir o perfil, em vez de falhar silenciosamente.
            if (error && /already registered|already exists|user_already_exists/i.test(error.message)) {
              const retry = await tempClient.auth.signInWithPassword({ email, password })
              if (!retry.error && retry.data.user) {
                data = retry.data as any
                error = null
              } else {
                cloudError = 'Este email já está registado no Supabase com outra senha — use "Esqueceu a senha" para recuperar o acesso, ou escolha outro email.'
              }
            }

            if (!error && data.user) {
              supabaseId = data.user.id
              const { error: profileErr } = await supabase.from('profiles').upsert({
                id: data.user.id,
                email,
                full_name: fullName,
                phone: phone || null,
                role,
                access_areas: access_areas ?? null,
                store_id: getCurrentStoreId(),
                created_at: new Date().toISOString(),
              }, { onConflict: 'id' })
              if (profileErr) {
                console.error('[createUser] profile upsert failed:', profileErr.message)
                cloudError = `Conta criada mas o perfil falhou a gravar: ${profileErr.message}`
                supabaseId = undefined // sem perfil, o login por Supabase recriaria como 'client' — não conta como sucesso na cloud
              }
            } else if (error && !cloudError) {
              console.error('[createUser] signUp failed:', error.message)
              cloudError = error.message
            }
          } catch (err: any) {
            console.error('[createUser] exception:', err?.message)
            cloudError = err?.message ?? 'Erro desconhecido ao contactar o Supabase'
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
        return { ok: true, supabaseId, error: cloudError }
      },
    }),
)

// Ouvir alterações de sessão Supabase (ex: fim de sessão real, token que falhou a renovar)
//
// IMPORTANTE: reage só ao evento SIGNED_OUT explícito. A condição anterior
// `|| !session` fechava a sessão sempre que este evento disparava SEM sessão
// Supabase — o que acontece sempre para contas locais (fallback, sem conta
// Supabase Auth real, ex: os utilizadores admin/funcionário semeados por
// omissão) e nalguns eventos internos do cliente (ex: INITIAL_SESSION de um
// visitante anónimo). Resultado: a app "terminava a sessão sozinha" mesmo em
// utilização activa, sem qualquer inactividade real.
if (isSupabaseReady() && supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      useAuthStore.setState({ user: null, isAuthenticated: false })
    }
  })

  // Ao voltar a dar foco à aba (ex: telemóvel que suspendeu o browser em
  // segundo plano), força uma verificação/renovação da sessão antes que o
  // token expire silenciosamente sem o cliente ter tido oportunidade de o
  // renovar automaticamente.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      supabase!.auth.getSession().catch(() => {})
    }
  })
}
