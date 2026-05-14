/**
 * storeContext.tsx — Contexto React para a loja activa
 *
 * Cada utilizador pertence a uma loja (store_id no profile).
 * Super admins podem alternar entre lojas.
 *
 * getCurrentStoreId() pode ser chamado em qualquer ficheiro sem hooks.
 */

import React, { createContext, useContext, useState, useCallback } from 'react'

export interface StoreInfo {
  id: string
  name: string
  slug?: string
  address?: string
  phone?: string
  email?: string
  whatsapp?: string
  nif?: string
  iva_rate?: number
  logo_url?: string
  active?: boolean
}

interface StoreContextType {
  store: StoreInfo | null
  setStore: (s: StoreInfo) => void
  clearStore: () => void
}

const StoreContext = createContext<StoreContextType>({
  store: null,
  setStore: () => {},
  clearStore: () => {},
})

const LS_KEY = 'khrismir_current_store'

function loadFromLS(): StoreInfo | null {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') }
  catch { return null }
}

// Chaves de negócio a limpar quando a loja muda (dados isolados por loja)
const BUSINESS_KEYS = [
  'khrismir_products', 'khrismir_categories', 'khrismir_orders',
  'khrismir_cashflow', 'khrismir_purchases', 'khrismir_suppliers',
  'khrismir_delivery_zones', 'khrismir_promos', 'khrismir_returns',
  'khrismir_loyalty', 'khrismir_shifts', 'khrismir_settings',
  'cf_movements', 'cf_accounts', 'cf_categories',
  'cf_deleted_ids',          // tombstone — recomeça para a nova loja
  'khrismir_auto_synced',    // força re-push dos dados da nova loja
]

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [store, setStoreState] = useState<StoreInfo | null>(loadFromLS)

  const setStore = useCallback((s: StoreInfo) => {
    // Se a loja mudou, limpa dados de negócio do localStorage
    // para que a nova loja comece com base de dados limpa
    try {
      const current = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
      if (current && current.id !== s.id) {
        BUSINESS_KEYS.forEach(k => localStorage.removeItem(k))
      }
    } catch { /* non-fatal */ }

    localStorage.setItem(LS_KEY, JSON.stringify(s))
    setStoreState(s)
    // Notifica todo o app que a loja mudou
    window.dispatchEvent(new CustomEvent('khrismir:store-changed', { detail: s }))
  }, [])

  const clearStore = useCallback(() => {
    localStorage.removeItem(LS_KEY)
    setStoreState(null)
  }, [])

  return (
    <StoreContext.Provider value={{ store, setStore, clearStore }}>
      {children}
    </StoreContext.Provider>
  )
}

/** Hook React para usar dentro de componentes */
export function useStore() {
  return useContext(StoreContext)
}

/** Função pura — pode ser chamada em sync.ts, realtime.ts, etc. sem hooks */
export function getCurrentStoreId(): string | null {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null')?.id ?? null }
  catch { return null }
}
