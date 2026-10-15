/**
 * storeContext.tsx — Contexto React para a loja activa
 *
 * Cada utilizador pertence a uma loja (store_id no profile).
 * Super admins podem alternar entre lojas.
 *
 * getCurrentStoreId() pode ser chamado em qualquer ficheiro sem hooks.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase, isSupabaseReady } from './supabase'

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

// Dados de negócio de UMA loja, a limpar sempre que a loja muda. Esta é a lista
// única (sync.ts usa-a também): só entram aqui dados que voltam da nuvem no
// pullAll() ou que são descartáveis (carrinho em curso) — nunca configuração
// que só existe neste dispositivo (contadores de facturas, AGT, utilizadores).
export const BUSINESS_KEYS = [
  'khrismir_products', 'khrismir_categories', 'khrismir_orders',
  'khrismir_cashflow', 'khrismir_purchases', 'khrismir_suppliers',
  'khrismir_delivery_zones', 'khrismir_promos', 'khrismir_returns',
  'khrismir_loyalty', 'khrismir_shifts', 'khrismir_settings',
  'cf_movements', 'cf_accounts', 'cf_categories',
  'khrismir_accounts', 'khrismir_journal',          // contabilidade
  'khrismir_map_references', 'khrismir_profiles',   // mapa de entregas, equipa da loja
  'khrismir_pos_cart',       // carrinho do PDV em curso
  'khrismir_last_pull_store',
  // 'cf_deleted_ids' NÃO entra aqui de propósito: é a lista do que o utilizador apagou
  // (movimentos/lançamentos) e serve para syncAllData() não os recriar a partir das
  // compras/vendas. Os ids são únicos (sync-pur-{idDaCompra}), por isso guardá-los
  // entre lojas é seguro — limpá-la ao mudar de loja fazia os apagados voltarem.
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
    // Tem de limpar os MESMOS dados de negócio que setStore() limpa ao trocar
    // de loja — senão fica uma janela em que a loja activa é null mas os
    // dados da loja anterior continuam em localStorage. Se a próxima loja
    // seleccionada for a primeira (current === null), o guard em setStore()
    // ("current && current.id !== s.id") nunca dispara, e a loja nova
    // arranca a mostrar produtos/encomendas/caixa da loja anterior até o
    // próximo pullAll() (que pode demorar ou falhar) os substituir.
    BUSINESS_KEYS.forEach(k => localStorage.removeItem(k))
    localStorage.removeItem(LS_KEY)
    setStoreState(null)
  }, [])

  // Confirma que a loja guardada localmente ainda existe mesmo no Supabase.
  // Se tiver sido apagada noutro dispositivo (ex: "Restaurar Backup" ou
  // "Reset Total"), os dados locais ficam a apontar para uma loja fantasma —
  // toda a sincronização seguinte falhava silenciosamente com "violates
  // foreign key constraint", sem se perceber porquê. Em vez de deixar
  // acumular esses erros, desligamos a loja e mandamos escolher/criar outra.
  useEffect(() => {
    if (!store || !isSupabaseReady() || !supabase) return
    // Loja criada sem internet ainda não existe no Supabase — não é "apagada".
    try {
      const local: any[] = JSON.parse(localStorage.getItem('khrismir_stores') || '[]')
      if (local.some(s => s.id === store.id && s.pending_sync)) return
    } catch { /* non-fatal */ }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase!.from('stores').select('id').eq('id', store.id).maybeSingle()
        if (cancelled) return
        // Erro de rede/servidor — não assume que a loja desapareceu,
        // só reage a uma resposta clara de "não encontrada".
        if (error) return
        if (!data) {
          // A cópia deste dispositivo é a fonte de verdade (a app funciona offline):
          // NUNCA apagar os dados locais só porque a nuvem não tem a loja — antes isto
          // limpava produtos, vendas e caixa a cada arranque. Recria a loja na nuvem a
          // partir da cópia local; o resto do trabalho sobe pela fila de envio.
          const { syncStore } = await import('./sync')
          await syncStore(store)
          toast.info(
            `A loja "${store.name}" não existia na nuvem — foi recriada a partir dos dados deste dispositivo. ` +
            `Nada foi apagado.`,
            { duration: 10000 }
          )
        }
      } catch { /* sem internet — não assume nada, mantém a loja local */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id])

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
