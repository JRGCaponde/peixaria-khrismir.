import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { useAuthStore } from './stores/useAuthStore'
import { pullAll } from './lib/sync'
import { isSupabaseReady } from './lib/supabase'
import { startRealtime } from './lib/realtime'

// Inicializar sessão Supabase, sincronizar dados e arrancar Realtime
async function boot() {
  if (isSupabaseReady()) {
    await useAuthStore.getState().initSupabaseSession()
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
