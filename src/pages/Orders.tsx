import { useState, useEffect } from 'react'
import { Clock, CheckCircle, XCircle, Package, Truck, ChefHat } from 'lucide-react'
import type { Order, OrderStatus } from '../types/database'

const statusConfig: Record<OrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  confirmado: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  preparando: { label: 'Preparando', color: 'bg-orange-100 text-orange-800', icon: ChefHat },
  pronto: { label: 'Pronto', color: 'bg-green-100 text-green-800', icon: Package },
  entregue: { label: 'Entregue', color: 'bg-emerald-100 text-emerald-800', icon: Truck },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: XCircle },
}

const statusKeys = Object.keys(statusConfig) as OrderStatus[]

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')

  useEffect(() => {
    const saved = localStorage.getItem('khrismir_orders')
    if (saved) setOrders(JSON.parse(saved))
  }, [])

  const filteredOrders = orders.filter(o => filter === 'all' || o.status === filter)

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Meus Pedidos</h1>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {(['all' as const, ...statusKeys] as const).map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${filter === status ? 'bg-cyan-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            {status === 'all' ? 'Todos' : statusConfig[status].label}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-lg">
          <p className="text-gray-500 text-xl mb-4">Nenhum pedido encontrado</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map(order => {
            const StatusIcon = statusConfig[order.status].icon
            return (
              <div key={order.id} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg">Pedido #{order.order_number}</h3>
                    <p className="text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleString('pt-AO')}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${statusConfig[order.status].color}`}>
                    <StatusIcon className="w-4 h-4" />
                    {statusConfig[order.status].label}
                  </span>
                </div>

                <div className="border-t pt-4">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between py-2">
                      <span>{item.product_name} ({item.preparation}) x{item.quantity}</span>
                      <span className="font-medium">{Number(item.total_price).toLocaleString('pt-AO')} AOA</span>
                    </div>
                  ))}
                </div>

                <div className="border-t mt-4 pt-4 flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    <p>Tipo: {order.delivery_type === 'retirada' ? '🏪 Retirada' : '🚚 Delivery'}</p>
                    <p>Pagamento: {order.payment_type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Total</p>
                    <p className="text-xl font-bold text-cyan-600">{Number(order.total).toLocaleString('pt-AO')} AOA</p>
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
