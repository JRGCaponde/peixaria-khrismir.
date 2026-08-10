import { useState, useEffect } from 'react'
import { Clock, CheckCircle, XCircle, Package, Truck, ChefHat, MessageCircle, Printer, RefreshCw } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'
import { getSettings } from '../lib/settings'
import { printInvoice, printBusinessInvoice } from '../utils/invoice'
import { printReceipt } from '../utils/receipt'
import type { Order, OrderStatus } from '../types/database'
import { pullAll } from '../lib/sync'

const statusConfig: Record<OrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  pendente:   { label: 'Pendente',   color: 'bg-yellow-100 text-yellow-800',  icon: Clock        },
  confirmado: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800',      icon: CheckCircle  },
  preparando: { label: 'Preparando', color: 'bg-orange-100 text-orange-800',  icon: ChefHat      },
  pronto:     { label: 'Pronto',     color: 'bg-green-100 text-green-800',    icon: Package      },
  entregue:   { label: 'Entregue',   color: 'bg-emerald-100 text-emerald-800',icon: Truck        },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-800',        icon: XCircle      },
}

const statusKeys = Object.keys(statusConfig) as OrderStatus[]

export default function Orders() {
  const { user } = useAuthStore()
  const settings = getSettings()
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const [syncing, setSyncing] = useState(false)

  const loadFromStorage = () => {
    const saved = localStorage.getItem('khrismir_orders')
    if (!saved) return
    const all: Order[] = JSON.parse(saved)
    setOrders(user?.role === 'client' ? all.filter(o => o.customer_id === user.id) : all)
  }

  const refresh = async () => {
    setSyncing(true)
    await pullAll()
    loadFromStorage()
    setSyncing(false)
  }

  useEffect(() => {
    loadFromStorage()
    refresh()

    // Realtime global (realtime.ts): o localStorage é actualizado automaticamente
    // quando qualquer dispositivo altera encomendas — só precisamos de recarregar
    const handleSync = (e: Event) => {
      const table = (e as CustomEvent).detail?.table
      if (!table || table === 'orders') loadFromStorage()
    }
    window.addEventListener('khrismir:sync', handleSync)

    return () => window.removeEventListener('khrismir:sync', handleSync)
  }, [user])

  const filtered = orders.filter(o => filter === 'all' || o.status === filter)

  const getWhatsAppLink = (order: Order) => {
    const msg = `Olá ${settings.name}! 🐟\nGostava de saber o estado do meu pedido *${order.order_number}*.\nObrigado!`
    return `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {user?.role === 'client' ? 'Os Meus Pedidos' : 'Encomendas Online'}
          </h2>
          <p className="text-gray-500 text-sm">Acompanhe o estado das encomendas</p>
        </div>
        <button onClick={refresh} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-0">
        {(['all' as const, ...statusKeys] as const).map(status => {
          const Icon = status !== 'all' ? statusConfig[status].icon : null
          return (
            <button key={status} onClick={() => setFilter(status)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition -mb-px ${
                filter === status ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {Icon && <Icon className="w-4 h-4" />}
              {status === 'all' ? 'Todos' : statusConfig[status].label}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-lg">
          <p className="text-gray-500 text-xl mb-4">Nenhum pedido encontrado</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(order => {
            const StatusIcon = statusConfig[order.status].icon
            return (
              <div key={order.id} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
                  <div>
                    <h3 className="font-bold text-lg">Pedido #{order.order_number}</h3>
                    <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleString('pt-AO')}</p>
                    {order.customer_name && user?.role !== 'client' && <p className="text-sm text-gray-600 font-medium">{order.customer_name}</p>}
                    {order.delivery_address && <p className="text-xs text-gray-400">📍 {order.delivery_address}</p>}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${statusConfig[order.status].color}`}>
                    <StatusIcon className="w-4 h-4" />
                    {statusConfig[order.status].label}
                  </span>
                </div>

                <div className="border-t pt-4">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between py-1.5 text-sm">
                      <span>{item.product_name} ({item.preparation}) × {item.quantity}</span>
                      <span className="font-medium">{Number(item.total_price).toLocaleString('pt-AO')} AOA</span>
                    </div>
                  ))}
                  {(order.delivery_fee ?? 0) > 0 && (
                    <div className="flex justify-between py-1.5 text-sm text-gray-500">
                      <span>Taxa de entrega ({order.delivery_zone})</span>
                      <span>{(order.delivery_fee || 0).toLocaleString('pt-AO')} AOA</span>
                    </div>
                  )}
                  {(order.discount_amount ?? 0) > 0 && (
                    <div className="flex justify-between py-1.5 text-sm text-green-600">
                      <span>Desconto ({order.discount_code})</span>
                      <span>-{(order.discount_amount || 0).toLocaleString('pt-AO')} AOA</span>
                    </div>
                  )}
                </div>

                <div className="border-t mt-4 pt-4 space-y-3 sm:space-y-0 sm:flex sm:justify-between sm:items-center sm:flex-wrap sm:gap-3">
                  <div className="text-sm text-gray-600">
                    <p>{order.delivery_type === 'retirada' ? '🏪 Retirada na loja' : '🚚 Entrega a domicílio'}</p>
                    <p>Pagamento: {order.payment_type}</p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex gap-2 sm:items-center sm:flex-wrap">
                    <button onClick={() => printReceipt(order, settings)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                      <Printer className="w-4 h-4" /> Talão
                    </button>
                    <button onClick={() => printInvoice(order, settings)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-100 transition">
                      <Printer className="w-4 h-4" /> A4
                    </button>
                    <button onClick={() => printBusinessInvoice(order, settings)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-100 transition">
                      <Printer className="w-4 h-4" /> Fatura AGT
                    </button>
                    {order.status !== 'entregue' && order.status !== 'cancelado' && (
                      <a href={getWhatsAppLink(order)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition">
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                      </a>
                    )}
                    <div className="col-span-2 sm:col-span-1 text-right sm:text-right bg-cyan-50 sm:bg-transparent rounded-xl p-2 sm:p-0">
                      <p className="text-sm text-gray-500">Total</p>
                      <p className="text-xl font-bold text-cyan-600">{Number(order.total).toLocaleString('pt-AO')} AOA</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
