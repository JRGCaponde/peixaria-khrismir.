import { createClient } from '@supabase/supabase-js'
import { fetchComGuarda, iniciarConectividade } from './connectivity'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseReady = () =>
  !!supabaseUrl && !!supabaseAnonKey && supabaseUrl !== 'a_tua_url_do_supabase_aqui'

// Só cria o cliente se as variáveis de ambiente estiverem definidas —
// evita crash em ambiente local sem .env configurado.
// O fetch passa pelo guarda de ligação (connectivity.ts): sem internet o cliente
// falha de imediato em vez de esperar por timeouts, e a app usa os dados locais.
export const supabase = isSupabaseReady()
  ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchComGuarda } })
  : null as unknown as ReturnType<typeof createClient>

// A verificação automática de ligação arranca junto com o cliente, antes de qualquer pedido.
if (isSupabaseReady()) iniciarConectividade()
