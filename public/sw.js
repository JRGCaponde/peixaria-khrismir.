const CACHE = 'khrismir-v3'
const PRECACHE = ['/', '/index.html', '/icon.svg', '/manifest.json']

// ── Install: pré-cache assets essenciais ─────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}))
  self.skipWaiting()
})

// ── Activate: limpa caches antigos ───────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

// ── Fetch ──────────────────────────────────────────────────────────────────
// Supabase API e realtime — sempre network.
// Navegação (index.html) — sempre network-first: os ficheiros JS/CSS do build
// têm nome com hash de conteúdo (ex: index-CFjZQOho.js) e cada deploy troca
// esse nome; servir um index.html antigo da cache aponta para ficheiros que
// já não existem no deploy novo → página em branco para quem já tinha
// visitado o site antes. Só usa a cache se estiver genuinamente offline.
// Assets com hash — cache-first, são imutáveis, seguro e mais rápido.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.hostname.includes('supabase.co')) return

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
        return res
      }).catch(() => caches.match(e.request).then(cached => cached || caches.match('/')))
    )
    return
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok && url.origin === self.location.origin) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()))
        }
        return res
      }).catch(() => cached)
      return cached || network
    })
  )
})

// ── Push: mostrar notificação quando servidor envia push ─────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Peixaria Khrismir', body: 'Nova notificação' }
  try { data = e.data?.json() ?? data } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.tag || 'khrismir',
      data: data.url ? { url: data.url } : undefined,
    })
  )
})

// ── Notification click: abre o app ───────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      const existing = ws.find(w => w.url.includes(self.location.origin))
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})
