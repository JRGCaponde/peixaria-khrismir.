import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseReady = () =>
  !!supabaseUrl && !!supabaseAnonKey && supabaseUrl !== 'a_tua_url_do_supabase_aqui'

// Só cria o cliente se as variáveis de ambiente estiverem definidas —
// evita crash em ambiente local sem .env configurado
export const supabase = isSupabaseReady()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as unknown as ReturnType<typeof createClient>
