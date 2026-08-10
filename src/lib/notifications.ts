/**
 * notifications.ts — Notificações locais do browser (sem servidor externo)
 * Usa a Notifications API nativa. Funciona offline.
 */

/** Pede permissão de notificações ao utilizador */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/** Mostra uma notificação local */
export function showNotification(title: string, body: string, opts?: { icon?: string; tag?: string }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, {
      body,
      icon: opts?.icon ?? '/icon.svg',
      tag:  opts?.tag,
      badge: '/icon.svg',
    })
  } catch { /* navegadores antigos podem não suportar */ }
}

/** Notifica nova encomenda pendente */
export function notifyNewOrder(orderNumber: string, customerName?: string) {
  showNotification(
    '🛒 Nova Encomenda!',
    `Encomenda ${orderNumber}${customerName ? ' — ' + customerName : ''} a aguardar confirmação.`,
    { tag: 'new-order-' + orderNumber }
  )
}

/** Retorna o nº actual de encomendas pendentes (do localStorage) */
export function getPendingOrderCount(): number {
  try {
    const orders: any[] = JSON.parse(localStorage.getItem('khrismir_orders') || '[]')
    return orders.filter(o => o.status === 'pendente').length
  } catch { return 0 }
}

/**
 * Inicia polling de encomendas pendentes a cada 30 segundos.
 * Chama `onCount(n)` sempre que o número muda.
 * Retorna função de limpeza para chamar no unmount.
 */
export function startOrderPolling(onCount: (count: number) => void): () => void {
  let last = getPendingOrderCount()
  onCount(last)
  const id = setInterval(() => {
    const current = getPendingOrderCount()
    if (current !== last) {
      last = current
      onCount(current)
    }
  }, 30_000)
  return () => clearInterval(id)
}
