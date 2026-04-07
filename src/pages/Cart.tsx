import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Plus, Minus, Truck, CreditCard, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import type { CartItem, Order, PaymentType, DeliveryType } from '../types/database'

export default function Cart() {
  const navigate = useNavigate()
  const [cart, setCart] = useState<CartItem[]>([])
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('retirada')
  const [paymentType, setPaymentType] = useState<PaymentType>('multicaixa')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('khrismir_cart')
    if (saved) setCart(JSON.parse(saved))
  }, [])

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart)
    localStorage.setItem('khrismir_cart', JSON.stringify(newCart))
  }

  const updateQuantity = (idx: number, delta: number) => {
    const newCart = [...cart]
    newCart[idx].quantity = Math.max(1, newCart[idx].quantity + delta)
    saveCart(newCart)
  }

  const removeItem = (idx: number) => {
    saveCart(cart.filter((_, i) => i !== idx))
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0)

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Carrinho vazio')
      return
    }

    if (deliveryType === 'delivery' && !address) {
      toast.error('Informe o endereço de entrega')
      return
    }

    setLoading(true)

    // Simular processamento
    await new Promise(r => setTimeout(r, 1500))

    // Criar pedido
    const orderNumber = `PKH-${Math.floor(10000 + Math.random() * 90000)}`
    const newOrder: Order = {
      id: Date.now().toString(),
      order_number: orderNumber,
      status: 'pendente',
      payment_type: paymentType,
      delivery_type: deliveryType,
      total: cartTotal,
      items: cart.map((c, i) => ({
        id: `${Date.now()}-${i}`,
        order_id: Date.now().toString(),
        product_id: c.id,
        product_name: c.name,
        quantity: c.quantity,
        unit_price: c.price,
        preparation: c.preparation,
        total_price: c.price * c.quantity
      })),
      created_at: new Date().toISOString()
    }

    // Salvar pedido
    const orders = JSON.parse(localStorage.getItem('khrismir_orders') || '[]')
    orders.unshift(newOrder)
    localStorage.setItem('khrismir_orders', JSON.stringify(orders))

    // Limpar carrinho
    localStorage.removeItem('khrismir_cart')
    setCart([])

    setLoading(false)
    toast.success(`Pedido ${orderNumber} criado com sucesso!`)
    navigate('/orders')
  }

  if (cart.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 text-xl mb-4">O seu carrinho está vazio</p>
        <button
          onClick={() => navigate('/catalog')}
          className="bg-cyan-600 text-white px-6 py-3 rounded-lg hover:bg-cyan-700 transition"
        >
          Ver Catálogo
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Carrinho de Compras</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-lg p-4 flex gap-4">
              <div className="w-20 h-20 bg-gradient-to-br from-cyan-100 to-blue-100 rounded-lg flex items-center justify-center text-4xl">
                🐟
              </div>
              <div className="flex-1">
                <h3 className="font-bold">{item.name}</h3>
                <p className="text-sm text-gray-500 capitalize">{item.preparation}</p>
                <p className="text-cyan-600 font-bold">{Number(item.price).toLocaleString('pt-AO')} AOA/{item.unit}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button onClick={() => removeItem(idx)} className="text-red-500">
                  <Trash2 className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(idx, -1)}
                    className="w-8 h-8 bg-gray-200 rounded-full hover:bg-gray-300"
                  >
                    <Minus className="w-4 h-4 mx-auto" />
                  </button>
                  <span className="w-8 text-center font-bold">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(idx, 1)}
                    className="w-8 h-8 bg-gray-200 rounded-full hover:bg-gray-300"
                  >
                    <Plus className="w-4 h-4 mx-auto" />
                  </button>
                </div>
                <p className="font-bold">{Number(item.price * item.quantity).toLocaleString('pt-AO')} AOA</p>
              </div>
            </div>
          ))}
        </div>

        {/* Checkout */}
        <div className="bg-white rounded-xl shadow-lg p-6 h-fit sticky top-4">
          <h2 className="text-lg font-bold mb-4">Finalizar Pedido</h2>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2">Tipo de Entrega</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDeliveryType('retirada')}
                  className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 ${deliveryType === 'retirada' ? 'border-cyan-600 bg-cyan-50' : 'border-gray-200'}`}
                >
                  <span>🏪</span> Retirada
                </button>
                <button
                  onClick={() => setDeliveryType('delivery')}
                  className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 ${deliveryType === 'delivery' ? 'border-cyan-600 bg-cyan-50' : 'border-gray-200'}`}
                >
                  <Truck className="w-4 h-4" /> Delivery
                </button>
              </div>
            </div>

            {deliveryType === 'delivery' && (
              <div>
                <label className="block text-sm font-medium mb-2">Endereço de Entrega</label>
                <textarea
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  rows={2}
                  placeholder="Morada completa..."
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Forma de Pagamento</label>
              <div className="space-y-2">
                <button
                  onClick={() => setPaymentType('multicaixa')}
                  className={`w-full p-3 rounded-lg border-2 flex items-center gap-2 ${paymentType === 'multicaixa' ? 'border-cyan-600 bg-cyan-50' : 'border-gray-200'}`}
                >
                  <CreditCard className="w-5 h-5" /> Multicaixa
                </button>
                <button
                  onClick={() => setPaymentType('express')}
                  className={`w-full p-3 rounded-lg border-2 flex items-center gap-2 ${paymentType === 'express' ? 'border-cyan-600 bg-cyan-50' : 'border-gray-200'}`}
                >
                  <span>💳</span> Express
                </button>
                <button
                  onClick={() => setPaymentType('dinheiro')}
                  className={`w-full p-3 rounded-lg border-2 flex items-center gap-2 ${paymentType === 'dinheiro' ? 'border-cyan-600 bg-cyan-50' : 'border-gray-200'}`}
                >
                  <Banknote className="w-5 h-5" /> Dinheiro
                </button>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between text-lg font-bold mb-4">
              <span>Total:</span>
              <span>{cartTotal.toLocaleString('pt-AO')} AOA</span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-cyan-700 hover:to-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'A processar...' : 'Confirmar Pedido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
