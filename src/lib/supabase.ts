import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Exporta o cliente principal
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Exporta a função que os outros ficheiros estão à procura
export const isSupabaseReady = () => {
  return !!supabaseUrl && !!supabaseAnonKey && supabaseUrl !== 'a_tua_url_do_supabase_aqui'
}
