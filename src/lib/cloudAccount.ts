/**
 * cloudAccount.ts — Liga a conta local com que se entrou (ex: admin@khrismir.ao) a uma
 * conta real do Supabase, para a app passar a ter sessão da nuvem e sincronizar.
 *
 * As contas semeadas por omissão só existem neste computador; o Supabase não as conhece,
 * por isso o login cai sempre na conta local e nunca há sessão online. Aqui entra-se
 * (ou regista-se) no Supabase com o mesmo email e a password que o utilizador acaba de
 * escrever. A password não é guardada.
 *
 * Nota de segurança: o Supabase não deixa o próprio utilizador promover-se a admin
 * (a coluna "role" só se altera na base). Por isso uma conta nova entra como "client"
 * e é preciso uma promoção única — devolvemos o SQL pronto a copiar.
 */
import { supabase, isSupabaseReady } from './supabase'
import { useAuthStore } from '../stores/useAuthStore'

const PAPEIS_EQUIPA = ['admin', 'employee', 'gerente', 'super_admin']

export type ResultadoLigar =
  | { ok: true; role: string; precisaPromocao: false }
  | { ok: true; role: string; precisaPromocao: true; sql: string }
  | { ok: false; erro: string }

export async function ligarContaNuvem(password: string): Promise<ResultadoLigar> {
  if (!isSupabaseReady() || !supabase) return { ok: false, erro: 'Supabase não configurado.' }
  const user = useAuthStore.getState().user
  if (!user?.email) return { ok: false, erro: 'Não há utilizador com sessão iniciada.' }
  if (!password) return { ok: false, erro: 'Escreve a password desta conta.' }

  try {
    let { data, error } = await supabase.auth.signInWithPassword({ email: user.email, password })
    if (error) {
      if (!/invalid login|invalid credentials/i.test(error.message)) return { ok: false, erro: error.message }
      // Conta ainda não existe na nuvem (ou a password é outra): tenta registá-la.
      const reg = await supabase.auth.signUp({
        email: user.email, password,
        options: { data: { full_name: user.full_name } },
      })
      if (reg.error) {
        if (/already registered|already exists/i.test(reg.error.message))
          return { ok: false, erro: 'Este email já existe no Supabase com outra password. Usa a password da conta online ou "Esqueceu a senha".' }
        return { ok: false, erro: reg.error.message }
      }
      data = reg.data as typeof data
      if (!reg.data.session)
        return { ok: false, erro: 'Conta criada, mas o Supabase pede para confirmares o email. Abre o email, confirma e volta a carregar em Sincronizar.' }
    }
    const uid = data.user?.id
    if (!uid) return { ok: false, erro: 'Sem resposta do Supabase.' }

    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle()
    const role = perfil?.role ?? 'client'
    const localEhEquipa = PAPEIS_EQUIPA.includes(user.role)
    if (localEhEquipa && !PAPEIS_EQUIPA.includes(role)) {
      const alvo = user.role === 'employee' ? 'employee' : user.role === 'gerente' ? 'gerente' : 'admin'
      return {
        ok: true, role, precisaPromocao: true,
        sql: `update profiles set role = '${alvo}' where email = '${user.email.replace(/'/g, "''")}';`,
      }
    }
    return { ok: true, role, precisaPromocao: false }
  } catch (e: any) {
    return { ok: false, erro: e?.message ?? 'Erro ao contactar o Supabase.' }
  }
}
