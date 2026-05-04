export function getPendingOrderCount(): number {
  try {
    const orders = JSON.parse(localStorage.getItem('khrismir_orders') || '[]')
    return orders.filter((o: any) => o.status === 'pendente').length
  } catch { return 0 }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function notifyNewOrder(orderNumber: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Nova Encomenda! 🐟', {
      body: `Encomenda ${orderNumber} aguarda confirmação`,
    })
  }
}

let lastCount = 0

export function startOrderPolling(onNewOrder: (count: number) => void): () => void {
  lastCount = getPendingOrderCount()
  const interval = setInterval(() => {
    const current = getPendingOrderCount()
    if (current > lastCount) {
      onNewOrder(current)
    }
    lastCount = current
  }, 10000)
  return () => clearInterval(interval)
}
