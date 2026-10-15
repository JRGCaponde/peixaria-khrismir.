import { useEffect, useState } from 'react'
import { useCloudOnline } from '../lib/connectivity'
import { hasCloudSession } from '../lib/sync'
import { supabase, isSupabaseReady } from '../lib/supabase'

/**
 * Mostra de onde a app está a trabalhar neste momento:
 *  - Online · Supabase       → ligada à nuvem e com sessão: tudo sincroniza.
 *  - Online · só local       → há internet mas a conta é local: guarda neste computador.
 *  - Offline · dados locais  → sem internet: trabalha só com o SQL local; a fila envia depois.
 */
export default function CloudStatus({ compact = false }: { compact?: boolean }) {
  const online = useCloudOnline()
  const [sessao, setSessao] = useState(false)

  useEffect(() => {
    let vivo = true
    const ler = () => { hasCloudSession().then(s => { if (vivo) setSessao(s) }) }
    ler()
    const sub = isSupabaseReady() ? supabase.auth.onAuthStateChange(() => ler()) : null
    const t = setInterval(ler, 15_000)
    return () => { vivo = false; clearInterval(t); sub?.data.subscription.unsubscribe() }
  }, [online])

  let cor = 'bg-green-400', texto = 'Online · Supabase'
  let dica = 'Ligado à nuvem: tudo o que fizeres sincroniza.'
  if (!isSupabaseReady() || !online) {
    cor = 'bg-amber-400'; texto = 'Offline · dados locais'
    dica = 'Sem ligação ao Supabase: a app trabalha com a base de dados local. Quando a ligação voltar, o que fizeres agora é enviado sozinho.'
  } else if (!sessao) {
    cor = 'bg-amber-400'; texto = 'Online · só local'
    dica = 'Há internet, mas a sessão é local: os dados ficam neste computador. Entra com uma conta online para sincronizar com a nuvem.'
  }

  return (
    <span className="flex items-center gap-1.5 bg-white/20 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap" title={dica}>
      <span className={`w-2 h-2 rounded-full ${cor}`} />
      <span className={compact ? '' : 'hidden xl:inline'}>{texto}</span>
    </span>
  )
}
