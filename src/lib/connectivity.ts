/**
 * connectivity.ts — Decide sozinho entre "nuvem (Supabase)" e "dados locais (SQL)".
 *
 * navigator.onLine só diz se há rede (Wi‑Fi ligado), não se a internet ou o
 * Supabase respondem. Por isso, a cada poucos segundos testa o próprio Supabase:
 *
 *   ONLINE  → a app fala com o Supabase e a fila de envio é enviada.
 *   OFFLINE → o cliente do Supabase nem tenta a rede (falha de imediato, sem
 *             esperar por timeouts) e a app trabalha só com os dados locais (SQLite
 *             no .exe), que ficam na fila até a ligação voltar.
 *
 * Quando volta a haver ligação, corre sozinho o que estiver registado em
 * aoReligar() (enviar a fila, sincronizar lojas, ir buscar novidades).
 */
import { useSyncExternalStore } from 'react'

const URL_SB: string | undefined = import.meta.env.VITE_SUPABASE_URL
const KEY_SB: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

const TIMEOUT_MS = 4000       // um Supabase que não responde em 4 s conta como offline
const CADA_ONLINE_MS = 20_000 // com ligação: confirma de vez em quando (barato)
const CADA_OFFLINE_MS = 6_000 // sem ligação: tenta voltar depressa

type Estado = 'online' | 'offline'

let estado: Estado = 'online'          // optimista só até à 1.ª sondagem (já feita no arranque)
let primeiraFeita = false
let primeira: Promise<void> | null = null
let temporizador: ReturnType<typeof setTimeout> | null = null
let iniciado = false

const ouvintes = new Set<() => void>()
const aoReligarCbs = new Set<() => void | Promise<void>>()

// Sempre o fetch global do momento (e não uma cópia): assim os testes podem substituí-lo.
const rawFetch: typeof fetch = (...a) => window.fetch(...a)

export function isCloudOnline(): boolean {
  return estado === 'online'
}

function definir(novo: Estado) {
  const antes = estado
  estado = novo
  if (novo === antes) return
  ouvintes.forEach(f => f())
  if (novo === 'online' && primeiraFeita) {
    // Voltou a haver ligação: corre o que estava à espera (enviar a fila, etc.)
    aoReligarCbs.forEach(cb => { Promise.resolve().then(cb).catch(e => console.warn('[connectivity] aoReligar', e)) })
  }
}

async function sondar(): Promise<boolean> {
  if (!URL_SB || !KEY_SB) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    // Qualquer resposta HTTP (mesmo 401/404) prova que o Supabase está alcançável.
    await rawFetch(`${URL_SB}/auth/v1/health`, { method: 'GET', headers: { apikey: KEY_SB }, cache: 'no-store', signal: ctl.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

export async function verificarAgora(): Promise<boolean> {
  const ok = await sondar()
  primeiraFeita = true
  definir(ok ? 'online' : 'offline')
  return ok
}

function agendar() {
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(async () => {
    await verificarAgora()
    agendar()
  }, estado === 'online' ? CADA_ONLINE_MS : CADA_OFFLINE_MS)
}

/** Arranca a verificação automática (idempotente). Chamar uma vez, no arranque da app. */
export function iniciarConectividade() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  primeira = verificarAgora().then(() => undefined)
  agendar()
  // O sistema operativo avisa quando a rede muda: confirma logo em vez de esperar.
  window.addEventListener('online', () => { verificarAgora(); agendar() })
  window.addEventListener('offline', () => { definir('offline'); agendar() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verificarAgora()
  })
}

/** Regista algo a correr sempre que a ligação volta. Devolve a função para cancelar. */
export function aoReligar(cb: () => void | Promise<void>): () => void {
  aoReligarCbs.add(cb)
  return () => aoReligarCbs.delete(cb)
}

/**
 * fetch do cliente do Supabase: offline não toca na rede (falha logo), online passa.
 * A mensagem começa por "Failed to fetch" porque o resto da app já trata esse texto
 * como "sem ligação" (avisos silenciosos, registo local, fila…).
 */
export const fetchComGuarda: typeof fetch = async (input, init) => {
  if (!primeiraFeita && primeira) await primeira          // espera pela 1.ª sondagem (máx. 4 s)
  if (estado === 'offline') throw new TypeError('Failed to fetch (sem ligação — a usar dados locais)')
  try {
    return await rawFetch(input, init)
  } catch (e) {
    // Uma falha de rede a meio (não um pedido cancelado) => passou a offline.
    if (e instanceof TypeError) { definir('offline'); agendar() }
    throw e
  }
}

// ── Para a interface ────────────────────────────────────────────────────────
function subscrever(f: () => void) {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

/** true = a falar com o Supabase; false = a usar só os dados locais. */
export function useCloudOnline(): boolean {
  return useSyncExternalStore(subscrever, () => estado === 'online', () => true)
}
