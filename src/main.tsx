import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { pullAll } from './lib/sync'
import { isSupabaseReady } from './lib/supabase'
import { startRealtime } from './lib/realtime'
import { useAuthStore } from './stores/useAuthStore'

// Sincronizar dados e arrancar Realtime. A sessão de FUNCIONÁRIO/ADMIN nunca é
// restaurada automaticamente — tem sempre de introduzir as credenciais quando
// o app é aberto. Um CLIENTE já registado é reconhecido automaticamente, para
// facilitar o acesso a quem volta a usar a app (ver useAuthStore.restoreClientSession).
async function boot() {
  await useAuthStore.getState().restoreClientSession()
  if (isSupabaseReady()) {
    await pullAll()      // Primeiro pull: traz tudo do Supabase para localStorage
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
