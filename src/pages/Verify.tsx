import { useState } from 'react'
import { Search, Package, Truck, CheckCircle, Clock, XCircle, ChefHat } from 'lucide-react'
import { toast } from 'sonner'
import type { Order, OrderStatus } from '../types/database'

const statusConfig: Record<OrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  confirmado: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  preparando: { label: 'Preparando', color: 'bg-orange-100 text-orange-800', icon: ChefHat },
  pronto: { label: 'Pronto', color: 'bg-green-100 text-green-800', icon: Package },
  entregue: { label: 'Entregue', color: 'bg-emerald-100 text-emerald-800', icon: Truck },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: XCircle },
}

export default function Verify() {
  const [orderNumber, setOrderNumber] = useState('')
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)

  const searchOrder = () => {
    if (!orderNumber.trim()) {
      toast.error('Digite o número do pedido')
      return
    }

    setLoading(true)
    
    // Buscar nos pedidos
    const storedOrders = localStorage.getItem('khrismir_orders')
    if (storedOrders) {
      const orders: Order[] = JSON.parse(storedOrders)
      const found = orders.find(o => o.order_number.toLowerCase() === orderNumber.toLowerCase())
      
      if (found) {
        setOrder(found)
        setLoading(false)
        return
      }
    }

    // Não encontrado
    setLoading(false)
    toast.error('Pedido não encontrado')
    setOrder(null)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchOrder()
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Verificar Pedido</h1>
          <p className="text-gray-600">Digite o número do seu pedido para verificar o status</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ex: PKH-23891"
              className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-lg"
            />
          </div>

          <button
            onClick={searchOrder}
            disabled={loading}
            className="w-full mt-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-4 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'A buscar...' : 'CONSULTAR STATUS'}
          </button>

          {/* Exemplos */}
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">Exemplos de pedidos:</p>
            <div className="flex justify-center gap-2 mt-2">
              <button onClick={() => setOrderNumber('PKH-23891')} className="text-cyan-600 hover:underline text-sm">PKH-23891</button>
              <span className="text-gray-400">|</span>
              <button onClick={() => setOrderNumber('PKH-23887')} className="text-cyan-600 hover:underline text-sm">PKH-23887</button>
              <span className="text-gray-400">|</span>
              <button onClick={() => setOrderNumber('PKH-23862')} className="text-cyan-600 hover:underline text-sm">PKH-23862</button>
            </div>
          </div>
        </div>

        {/* Result */}
        {order && (
          <div className="bg-white rounded-2xl shadow-2xl p-6 mt-6">
            <div className="text-center mb-6">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${statusConfig[order.status].color}`}>
                {(() => {
                  const Icon = statusConfig[order.status].icon
                  return <Icon className="w-5 h-5" />
                })()}
                <span className="font-semibold">{statusConfig[order.status].label}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-gray-600">Número do Pedido</span>
                <span className="font-bold text-lg">{order.order_number}</span>
              </div>
              
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-gray-600">Data</span>
                <span>{new Date(order.created_at).toLocaleString('pt-AO')}</span>
              </div>
              
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-gray-600">Tipo de Entrega</span>
                <span>{order.delivery_type === 'retirada' ? '🏪 Retirada na Loja' : '🚚 Delivery'}</span>
              </div>
              
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-gray-600">Pagamento</span>
                <span className="capitalize">{order.payment_type}</span>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mt-4">
                <h4 className="font-semibold mb-2">Itens do Pedido</h4>
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span>{item.product_name} ({item.preparation}) x{item.quantity}</span>
                    <span className="font-medium">{Number(item.total_price).toLocaleString('pt-AO')} AOA</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-4">
                <span className="text-lg font-semibold">Total</span>
                <span className="text-2xl font-bold text-cyan-600">{Number(order.total).toLocaleString('pt-AO')} AOA</span>
              </div>
            </div>

            <button
              onClick={() => { setOrder(null); setOrderNumber('') }}
              className="w-full mt-6 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200 transition"
            >
              Consultar Outro Pedido
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
