import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useCloudOnline } from '../lib/connectivity'
import { hasCloudSession, sincronizarAgora, contarPendentes } from '../lib/sync'
import { supabase, isSupabaseReady } from '../lib/supabase'
import { ligarContaNuvem } from '../lib/cloudAccount'

/**
 * Mostra de onde a app está a trabalhar neste momento — e é um botão que força a
 * passagem para online ("Sincronizar agora"):
 *  - Online · Supabase       → ligada à nuvem e com sessão: tudo sincroniza.
 *  - Online · só local       → há internet mas a conta é local: guarda neste computador.
 *  - Offline · dados locais  → sem internet: trabalha só com o SQL local; a fila envia depois.
 */
export default function CloudStatus({ compact = false }: { compact?: boolean }) {
  const online = useCloudOnline()
  const [sessao, setSessao] = useState(false)
  const [pendentes, setPendentes] = useState(0)
  const [a_sincronizar, setASincronizar] = useState(false)
  const [ligarAberto, setLigarAberto] = useState(false)
  const [pass, setPass] = useState('')
  const [aLigar, setALigar] = useState(false)
  const [erroLigar, setErroLigar] = useState('')
  const [sqlPromover, setSqlPromover] = useState('')

  useEffect(() => {
    let vivo = true
    const ler = () => {
      hasCloudSession().then(s => { if (vivo) setSessao(s) })
      contarPendentes().then(n => { if (vivo) setPendentes(n) })
    }
    ler()
    const sub = isSupabaseReady() ? supabase.auth.onAuthStateChange(() => ler()) : null
    const t = setInterval(ler, 15_000)
    return () => { vivo = false; clearInterval(t); sub?.data.subscription.unsubscribe() }
  }, [online])

  const sincronizar = async () => {
    if (a_sincronizar) return
    setASincronizar(true)
    try {
      const r = await sincronizarAgora()
      if (r.estado === 'sem-ligacao') {
        toast.warning('Continua sem ligação ao Supabase. A app segue a trabalhar com os dados locais e tenta de novo sozinha.')
      } else if (r.estado === 'sem-sessao') {
        setErroLigar(''); setSqlPromover(''); setPass(''); setLigarAberto(true)
      } else if (r.erro) {
        toast.error(`Ligado, mas não consegui actualizar tudo: ${r.erro}`)
      } else {
        toast.success(
          r.enviados > 0
            ? `✅ Online: ${r.enviados} alterações enviadas para a nuvem${r.pendentes ? ` (${r.pendentes} ainda em espera)` : ''}.`
            : '✅ Online: tudo actualizado com a nuvem.'
        )
      }
    } finally {
      setASincronizar(false)
      contarPendentes().then(setPendentes)
      hasCloudSession().then(setSessao)
    }
  }

  const ligarConta = async () => {
    setALigar(true); setErroLigar('')
    const r = await ligarContaNuvem(pass)
    setALigar(false)
    if (!r.ok) { setErroLigar(r.erro); return }
    setPass('')
    setSessao(true)
    if (r.precisaPromocao) { setSqlPromover(r.sql); return }
    setLigarAberto(false)
    toast.success('✅ Conta ligada à nuvem. A sincronizar…')
    sincronizar()
  }

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
    <>
    <button
      type="button"
      onClick={sincronizar}
      disabled={a_sincronizar || !isSupabaseReady()}
      className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-70 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition"
      title={`${dica}\n\nCarrega para ligar e sincronizar agora.`}
    >
      <span className={`w-2 h-2 rounded-full ${cor}`} />
      <span className={compact ? '' : 'hidden xl:inline'}>{texto}</span>
      {pendentes > 0 && <span className="bg-orange-500 text-white font-black rounded-full px-1.5 text-[10px]">{pendentes > 999 ? '999+' : pendentes}</span>}
      <RefreshCw className={`w-3.5 h-3.5 ${a_sincronizar ? 'animate-spin' : ''}`} />
      <span className={compact ? '' : 'hidden 2xl:inline'}>{a_sincronizar ? 'A ligar…' : 'Sincronizar'}</span>
    </button>
    {ligarAberto && (
      <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => !aLigar && setLigarAberto(false)}>
        <div className="bg-white text-gray-800 rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
          <h3 className="font-bold text-lg">Ligar esta conta à nuvem</h3>
          {!sqlPromover ? (
            <>
              <p className="text-sm text-gray-600">
                Esta conta só existe neste computador, por isso não há sessão do Supabase e nada sincroniza.
                Escreve a password desta conta para a ligar à nuvem (se ainda não existir lá, é criada). A password não é guardada.
              </p>
              <input
                type="password" autoFocus value={pass} onChange={e => setPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !aLigar && ligarConta()}
                placeholder="Password" className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              {erroLigar && <p className="text-sm text-red-600">{erroLigar}</p>}
              <div className="flex justify-end gap-2">
                <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => setLigarAberto(false)} disabled={aLigar}>Cancelar</button>
                <button className="px-3 py-2 text-sm rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-60" onClick={ligarConta} disabled={aLigar || !pass}>
                  {aLigar ? 'A ligar…' : 'Ligar à nuvem'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Conta ligada, mas na nuvem ela entra só como cliente. Por segurança, só tu podes dar-lhe o papel de equipa: no Supabase → SQL Editor, cola e corre este comando (só o texto abaixo) e depois carrega em Sincronizar.
              </p>
              <pre className="bg-gray-100 rounded-lg p-3 text-xs whitespace-pre-wrap break-all select-all">{sqlPromover}</pre>
              <div className="flex justify-end gap-2">
                <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => navigator.clipboard?.writeText(sqlPromover).then(() => toast.success('SQL copiado'))}>Copiar SQL</button>
                <button className="px-3 py-2 text-sm rounded-lg bg-cyan-600 text-white hover:bg-cyan-700" onClick={() => { setLigarAberto(false); setSqlPromover('') }}>Feito</button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </>
  )
}
