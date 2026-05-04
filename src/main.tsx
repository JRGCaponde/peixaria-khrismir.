import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { useAuthStore } from './stores/useAuthStore'
import { pullAll } from './lib/sync'
import { isSupabaseReady } from './lib/supabase'

// Inicializar sessão Supabase e sincronizar dados ao arrancar
async function boot() {
  if (isSupabaseReady()) {
    await useAuthStore.getState().initSupabaseSession()
    await pullAll()
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
