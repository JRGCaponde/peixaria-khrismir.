import { useState, useEffect } from 'react'
import { Clock, CheckCircle, XCircle, Package, Truck, ChefHat, MessageCircle, Printer, RefreshCw } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'
import { getSettings } from '../lib/settings'
import { printInvoice } from '../utils/invoice'
import type { Order, OrderStatus } from '../types/database'
import { supabase, isSupabaseReady } from '../lib/supabase'
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

    // Subscrição Realtime — o estado do pedido actualiza automaticamente
    if (!isSupabaseReady() || !supabase) return
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, payload => {
        setOrders(prev => prev.map(o =>
          o.id === payload.new.id ? { ...o, status: payload.new.status as OrderStatus, updated_at: payload.new.updated_at } : o
        ))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        refresh()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  const filtered = orders.filter(o => filter === 'all' || o.status === filter)

  const getWhatsAppLink = (order: Order) => {
    const msg = `Olá ${settings.name}! 🐟\nGostava de saber o estado do meu pedido *${order.order_number}*.\nObrigado!`
    return `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          {user?.role === 'client' ? 'Os Meus Pedidos' : 'Encomendas Online'}
        </h1>
        <button onClick={refresh} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {(['all' as const, ...statusKeys] as const).map(status => (
          <button key={status} onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${filter === status ? 'bg-cyan-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
            {status === 'all' ? 'Todos' : statusConfig[status].label}
          </button>
        ))}
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

                <div className="border-t mt-4 pt-4 flex justify-between items-center flex-wrap gap-3">
                  <div className="text-sm text-gray-600">
                    <p>{order.delivery_type === 'retirada' ? '🏪 Retirada na loja' : '🚚 Entrega a domicílio'}</p>
                    <p>Pagamento: {order.payment_type}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => printInvoice(order, settings)}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                      <Printer className="w-4 h-4" /> Fatura
                    </button>
                    {order.status !== 'entregue' && order.status !== 'cancelado' && (
                      <a href={getWhatsAppLink(order)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition">
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                      </a>
                    )}
                    <div className="text-right">
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
