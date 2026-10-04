/**
 * sqliteMirror.ts — No Electron, o SQLite é a fonte de verdade dos dados.
 *
 * O preload (electron/preload.cjs) carrega tudo do SQLite para o localStorage
 * antes de a app arrancar. Este módulo faz o caminho inverso: cada escrita ao
 * localStorage é gravada também no SQLite (em lote, ~150 ms depois), por isso
 * o localStorage é só uma cache de trabalho — pode ser apagado sem perder dados.
 *
 * Tem de ser o PRIMEIRO import de main.tsx: há módulos que escrevem no
 * localStorage ao serem importados.
 *
 * Na Web não faz nada.
 */

const FLUSH_MS = 150
const RETRY_MS = 5000

// Mesma regra do preload: a sessão do Supabase (sb-*) não vai para o SQLite.
const isMirrored = (key: string) => !key.startsWith('sb-')

type Entry = { key: string; value: string | null }

function install() {
  const api = (window as any).electronAPI
  if (!api?.isElectron || !api.db?.kvSetMany) return
  if ((Storage.prototype as any).__sqliteMirrored) return
  ;(Storage.prototype as any).__sqliteMirrored = true

  const pending = new Map<string, string | null>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const take = (): Entry[] => {
    const entries = Array.from(pending, ([key, value]) => ({ key, value }))
    pending.clear()
    return entries
  }

  const schedule = (ms: number) => {
    if (!timer) timer = setTimeout(flush, ms)
  }

  function flush() {
    timer = null
    if (!pending.size) return
    const entries = take()
    api.db.kvSetMany(entries).catch((e: any) => {
      console.error('[sqliteMirror] falhou a gravar no SQLite, vai tentar de novo:', e?.message)
      // Devolve à fila (sem sobrepor o que entretanto mudou) e tenta mais tarde.
      for (const { key, value } of entries) if (!pending.has(key)) pending.set(key, value)
      schedule(RETRY_MS)
    })
  }

  const queue = (key: string, value: string | null) => {
    pending.set(key, value)
    schedule(FLUSH_MS)
  }

  // Ao fechar a janela não dá para esperar por Promises: grava já, em modo síncrono.
  const flushSync = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (!pending.size) return
    try { api.db.kvSetManySync(take()) } catch (e) { console.error('[sqliteMirror] flushSync', e) }
  }
  window.addEventListener('beforeunload', flushSync)
  window.addEventListener('pagehide', flushSync)

  const proto = Storage.prototype
  const origSet = proto.setItem
  const origRemove = proto.removeItem
  const origClear = proto.clear

  proto.setItem = function (this: Storage, key: string, value: string) {
    origSet.call(this, key, value)
    if (this === window.localStorage && isMirrored(String(key))) queue(String(key), String(value))
  }
  proto.removeItem = function (this: Storage, key: string) {
    origRemove.call(this, key)
    if (this === window.localStorage && isMirrored(String(key))) queue(String(key), null)
  }
  proto.clear = function (this: Storage) {
    if (this === window.localStorage) {
      for (let i = 0; i < this.length; i++) {
        const k = this.key(i)
        if (k && isMirrored(k)) queue(k, null)
      }
    }
    origClear.call(this)
  }
}

install()
