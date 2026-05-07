// Presence — rastreia quem está logado em tempo real via Supabase Realtime
import { supabase, isSupabaseReady } from './supabase'

export interface OnlineUser {
  id: string
  name: string
  email: string
  role: string
  device: string        // user-agent curto
  joinedAt: string      // ISO timestamp
  presenceRef?: string  // chave interna do Presence
}

type Listener = (users: OnlineUser[]) => void

let channel: ReturnType<typeof supabase.channel> | null = null
let currentUser: OnlineUser | null = null
const listeners = new Set<Listener>()
let latestUsers: OnlineUser[] = []

function parseDevice(): string {
  const ua = navigator.userAgent
  if (/Android/i.test(ua))  return '📱 Android'
  if (/iPhone|iPad/i.test(ua)) return '📱 iOS'
  if (/Windows/i.test(ua))  return '🖥️ Windows'
  if (/Mac/i.test(ua))       return '🍎 Mac'
  if (/Linux/i.test(ua))     return '🐧 Linux'
  return '🌐 Web'
}

function notify(users: OnlineUser[]) {
  latestUsers = users
  listeners.forEach(fn => fn(users))
}

function buildUsersFromState(state: Record<string, any[]>): OnlineUser[] {
  const result: OnlineUser[] = []
  for (const [presenceRef, presences] of Object.entries(state)) {
    for (const p of presences) {
      result.push({ ...p, presenceRef })
    }
  }
  // Ordena por hora de entrada (mais recente primeiro)
  return result.sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())
}

export function startPresenceTracking(user: { id: string; full_name: string; email: string; role: string }) {
  if (!isSupabaseReady() || !supabase) return
  if (channel) return // já activo

  currentUser = {
    id:       user.id,
    name:     user.full_name,
    email:    user.email,
    role:     user.role,
    device:   parseDevice(),
    joinedAt: new Date().toISOString(),
  }

  channel = supabase
    .channel('khrismir-presence', { config: { presence: { key: user.id } } })
    .on('presence', { event: 'sync' }, () => {
      const state = channel!.presenceState<OnlineUser>()
      notify(buildUsersFromState(state))
    })
    .on('presence', { event: 'join' }, () => {
      // presence sync event já cobre isto; join serve de reforço
      const state = channel!.presenceState<OnlineUser>()
      notify(buildUsersFromState(state))
    })
    .on('presence', { event: 'leave' }, () => {
      const state = channel!.presenceState<OnlineUser>()
      notify(buildUsersFromState(state))
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED' && currentUser) {
        await channel!.track(currentUser)
      }
    })
}

export function stopPresenceTracking() {
  if (!channel || !supabase) return
  channel.untrack().then(() => {
    supabase!.removeChannel(channel!)
    channel = null
    currentUser = null
    notify([])
  })
}

export function subscribePresence(fn: Listener): () => void {
  listeners.add(fn)
  // Envia estado actual imediatamente
  fn(latestUsers)
  return () => listeners.delete(fn)
}

export function getOnlineUsers(): OnlineUser[] {
  return latestUsers
}
