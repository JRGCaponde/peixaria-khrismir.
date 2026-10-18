import './lib/sqliteMirror' // 1.º import: tem de estar activo antes de qualquer módulo escrever no localStorage
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { pullAll, startOutboxDrain, startPendingStoresSync } from './lib/sync'
import { isSupabaseReady } from './lib/supabase'
import { startRealtime } from './lib/realtime'
import { useAuthStore } from './stores/useAuthStore'
import { setOutboxUserRole } from './lib/localDB'

// A fila offline do browser só guarda escritas de quem é da equipa (ver localDB.ts).
setOutboxUserRole(useAuthStore.getState().user?.role)
useAuthStore.subscribe(s => setOutboxUserRole(s.user?.role))

// Sincronizar dados e arrancar Realtime. A sessão de FUNCIONÁRIO/ADMIN nunca é
// restaurada automaticamente — tem sempre de introduzir as credenciais quando
// o app é aberto. Um CLIENTE já registado é reconhecido automaticamente, para
// facilitar o acesso a quem volta a usar a app (ver useAuthStore.restoreClientSession).
async function boot() {
  await useAuthStore.getState().restoreClientSession()
  // No Electron, a app tem de arrancar mesmo sem internet — os dados ficam no
  // SQLite local (ver lib/localDB.ts) e a fila de envio (startOutboxDrain) trata
  // de sincronizar assim que a ligação voltar. Por isso não bloqueia no pullAll.
  startPendingStoresSync()
  startOutboxDrain() // Electron (SQLite) e browser (localStorage)
  if (isSupabaseReady()) {
    await pullAll()      // Primeiro pull: traz tudo do Supabase para localStorage/SQLite
    startRealtime()      // A partir daqui qualquer mudança no Supabase chega em tempo real
  }
}
boot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
