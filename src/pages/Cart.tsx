import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Plus, Minus, Truck, CreditCard, Banknote, ShoppingBag, Tag, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../stores/useAuthStore'
import { getSettings } from '../lib/settings'
import type { CartItem, Order, PaymentType, DeliveryType, DeliveryZone, PromoCode } from '../types/database'
import { calcOrderHash } from '../utils/saft'
import { registerSaleMovement } from '../lib/cashflow'
import { notifyNewOrder } from '../lib/sync'

export default function Cart() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const settings = getSettings()

  const [cart,         setCart]         = useState<CartItem[]>([])
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('retirada')
  const [paymentType,  setPaymentType]  = useState<PaymentType>('multicaixa')
  const [address,      setAddress]      = useState('')
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(null)
  const [promoInput,   setPromoInput]   = useState('')
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [selectedBank, setSelectedBank] = useState('')

  const deliveryZones: DeliveryZone[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_delivery_zones') || '[]') } catch { return [] } })()
  const bankAccounts: { id: string; name: string; type: string }[] = (() => {
    try {
      const all = JSON.parse(localStorage.getItem('cf_accounts') || '[]')
      return all.filter((a: any) => a.type === 'bank')
    } catch { return [] }
  })()

  useEffect(() => {
    try { const saved = localStorage.getItem('khrismir_cart'); if (saved) setCart(JSON.parse(saved)) } catch {}
  }, [])

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart)
    localStorage.setItem('khrismir_cart', JSON.stringify(newCart))
  }

  const updateQuantity = (idx: number, delta: number) => {
    saveCart(cart.map((item, i) => i === idx ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item))
  }

  const removeItem = (idx: number) => saveCart(cart.filter((_, i) => i !== idx))

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0)
  const deliveryFee = deliveryType === 'delivery' ? (selectedZone?.price ?? 0) : 0
  const discountAmount = appliedPromo
    ? appliedPromo.discount_type === 'percentage'
      ? Math.round(subtotal * appliedPromo.discount_value / 100)
      : appliedPromo.discount_value
    : 0
  const cartTotal = subtotal + deliveryFee - discountAmount

  const applyPromo = () => {
    const promos: PromoCode[] = (() => { try { return JSON.parse(localStorage.getItem('khrismir_promos') || '[]') } catch { return [] } })()
    const code = promos.find(p => p.code === promoInput.toUpperCase() && p.active)
    if (!code) { toast.error('Código inválido ou inactivo'); return }
    if (code.max_uses && code.uses >= code.max_uses) { toast.error('Código esgotado'); return }
    if (code.expires_at && new Date(code.expires_at) < new Date()) { toast.error('Código expirado'); return }
    if (subtotal < code.min_order) { toast.error(`Pedido mínimo: ${code.min_order.toLocaleString()} Kz`); return }
    setAppliedPromo(code)
    toast.success(`Desconto aplicado!`)
  }

  const removePromo = () => { setAppliedPromo(null); setPromoInput('') }

  const handleCheckout = async () => {
    if (cart.length === 0) { toast.error('Carrinho vazio'); return }
    if (deliveryType === 'delivery' && !address.trim()) { toast.error('Informe o endereço de entrega'); return }
    if (settings.min_order_delivery > 0 && deliveryType === 'delivery' && subtotal < settings.min_order_delivery) {
      toast.error(`Pedido mínimo para delivery: ${settings.min_order_delivery.toLocaleString()} Kz`); return
    }

    setLoading(true)
    await new Promise(r => setTimeout(r, 1200))

    const now         = Date.now()
    const orderNumber = `PKH-${Math.floor(10000 + Math.random() * 90000)}`

    const orderBase = {
      id:              now.toString(),
      order_number:    orderNumber,
      customer_id:     user?.id,
      customer_name:   user?.full_name,
      customer_phone:  user?.phone,
      status:          'pendente' as const,
      payment_type:    paymentType,
      delivery_type:   deliveryType,
      delivery_zone:   selectedZone?.name,
      delivery_fee:    deliveryFee,
      delivery_address: address || undefined,
      discount_code:   appliedPromo?.code,
      discount_amount: discountAmount || undefined,
      subtotal:        subtotal,
      total:           cartTotal,
      items: cart.map((c, i) => ({
        id:           `${now}-${i}`,
        order_id:     now.toString(),
        product_id:   c.id,
        product_name: c.name,
        quantity:     c.quantity,
        unit_price:   c.price,
        preparation:  c.preparation,
        total_price:  c.price * c.quantity,
      })),
      created_at: new Date().toISOString(),
    }

    // Hash de autenticação AGT (encadeado)
    const newOrder: Order = { ...orderBase, hash: calcOrderHash(orderBase) }

    const orders: Order[] = JSON.parse(localStorage.getItem('khrismir_orders') || '[]')
    orders.unshift(newOrder)
    localStorage.setItem('khrismir_orders', JSON.stringify(orders))

    // Regista no Fluxo de Caixa — banco escolhido para Multicaixa
    const bankAccount = paymentType === 'multicaixa' && selectedBank ? selectedBank : undefined
    registerSaleMovement(cartTotal, orderNumber, paymentType, now.toString(), bankAccount)

    // Envia encomenda para o Supabase com retry automático (admin vê em tempo real)
    notifyNewOrder(newOrder, orderNumber, cartTotal, user?.full_name)

    if (appliedPromo) {
      const promos: PromoCode[] = JSON.parse(localStorage.getItem('khrismir_promos') || '[]')
      const idx = promos.findIndex(p => p.id === appliedPromo.id)
      if (idx !== -1) { promos[idx].uses += 1; localStorage.setItem('khrismir_promos', JSON.stringify(promos)) }
    }

    localStorage.removeItem('khrismir_cart')
    setCart([])
    setLoading(false)

    const whatsappMsg = `Olá ${settings.name}! 🐟\nFiz um pedido online.\n📦 *${orderNumber}*\n💰 *${cartTotal.toLocaleString()} AOA*\n${deliveryType === 'delivery' ? `🚚 Entrega a domicílio – ${address}` : '🏪 Retirada na loja'}\nPagamento: ${paymentType}${appliedPromo ? `\n🏷️ Promo: ${appliedPromo.code}` : ''}`
    const whatsappUrl = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(whatsappMsg)}`

    toast.success(`Pedido ${orderNumber} criado!`, {
      duration: 10000,
      action: { label: '📱 Avisar via WhatsApp', onClick: () => window.open(whatsappUrl, '_blank') },
    })
    navigate('/orders')
  }

  if (cart.length === 0) {
    return (
      <div className="text-center py-20">
        <ShoppingBag className="w-20 h-20 text-gray-200 mx-auto mb-4" />
        <p className="text-gray-500 text-xl mb-2">O seu carrinho está vazio</p>
        <p className="text-gray-400 text-sm mb-6">Adicione produtos do catálogo para continuar.</p>
        <button onClick={() => navigate('/catalog')} className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition">
          Ver Catálogo
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Carrinho de Compras</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Lista de itens */}
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-lg p-4 flex gap-4">
              <div className="w-20 h-20 bg-gradient-to-br from-cyan-100 to-blue-100 rounded-lg flex items-center justify-center text-4xl flex-shrink-0">
                {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover rounded-lg" /> : '🐟'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold truncate">{item.name}</h3>
                <p className="text-sm text-gray-500 capitalize">{item.preparation}</p>
                <p className="text-cyan-600 font-bold">{Number(item.price).toLocaleString('pt-AO')} AOA/{item.unit}</p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 transition"><Trash2 className="w-5 h-5" /></button>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQuantity(idx, -1)} className="w-8 h-8 bg-gray-200 rounded-full hover:bg-gray-300 transition flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                  <span className="w-8 text-center font-bold">{item.quantity}</span>
                  <button onClick={() => updateQuantity(idx, 1)} className="w-8 h-8 bg-cyan-600 text-white rounded-full hover:bg-cyan-700 transition flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                </div>
                <p className="font-bold text-sm">{Number(item.price * item.quantity).toLocaleString('pt-AO')} AOA</p>
              </div>
            </div>
          ))}
        </div>

        {/* Checkout */}
        <div className="bg-white rounded-xl shadow-lg p-6 h-fit sticky top-4">
          <h2 className="text-lg font-bold mb-4">Finalizar Pedido</h2>
          <div className="space-y-4 mb-6">

            {/* Entrega */}
            <div>
              <label className="block text-sm font-medium mb-2">Tipo de Entrega</label>
              <div className="grid grid-cols-2 gap-2">
                {(['retirada', 'delivery'] as DeliveryType[]).map(type => {
                  const disabled = type === 'delivery' && !settings.delivery_enabled
                  return (
                    <button key={type} onClick={() => !disabled && setDeliveryType(type)} disabled={disabled}
                      className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 transition font-medium text-sm ${
                        deliveryType === type ? 'border-cyan-600 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-600'
                      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                      {type === 'retirada' ? <><span>🏪</span> Retirada</> : <><Truck className="w-4 h-4" /> Delivery</>}
                    </button>
                  )
                })}
              </div>
            </div>

            {deliveryType === 'delivery' && (
              <>
                {deliveryZones.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Zona de Entrega</label>
                    <select value={selectedZone?.id || ''} onChange={e => setSelectedZone(deliveryZones.find(z => z.id === e.target.value) || null)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm" required>
                      <option value="">Selecionar zona...</option>
                      {deliveryZones.map(z => (
                        <option key={z.id} value={z.id}>{z.name} — {z.price === 0 ? 'Grátis' : `${z.price.toLocaleString()} Kz`}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-2">Endereço de Entrega *</label>
                  <textarea value={address} onChange={e => setAddress(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 resize-none"
                    rows={2} placeholder="Morada completa, referência..." />
                </div>
              </>
            )}

            {/* Pagamento */}
            <div>
              <label className="block text-sm font-medium mb-2">Forma de Pagamento</label>
              <div className="space-y-2">
                {([
                  { type: 'multicaixa' as PaymentType, label: 'Multicaixa', icon: <CreditCard className="w-5 h-5" /> },
                  { type: 'express'    as PaymentType, label: 'Express',    icon: <span className="text-lg">📱</span> },
                  { type: 'dinheiro'   as PaymentType, label: 'Dinheiro',   icon: <Banknote className="w-5 h-5" /> },
                ]).map(p => (
                  <button key={p.type} onClick={() => setPaymentType(p.type)}
                    className={`w-full p-3 rounded-lg border-2 flex items-center gap-3 transition font-medium text-sm ${
                      paymentType === p.type ? 'border-cyan-600 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-600'
                    }`}>
                    {p.icon} {p.label}
                  </button>
                ))}
                {paymentType === 'multicaixa' && bankAccounts.length > 0 && (
                  <div className="mt-1">
                    <label className="block text-xs text-gray-500 font-medium mb-1">Banco de destino</label>
                    <select
                      value={selectedBank || bankAccounts[0]?.name}
                      onChange={e => setSelectedBank(e.target.value)}
                      className="w-full border border-cyan-300 bg-cyan-50 p-2 rounded-lg text-sm font-medium text-cyan-800 focus:ring-2 focus:ring-cyan-500"
                    >
                      {bankAccounts.map(b => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Promo */}
            <div>
              <label className="block text-sm font-medium mb-2">Código Promocional</label>
              {appliedPromo ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 p-3 rounded-lg">
                  <div>
                    <span className="font-bold text-green-700 font-mono">{appliedPromo.code}</span>
                    <p className="text-xs text-green-600">
                      {appliedPromo.discount_type === 'percentage' ? `${appliedPromo.discount_value}% desconto` : `${appliedPromo.discount_value.toLocaleString()} Kz desconto`}
                    </p>
                  </div>
                  <button onClick={removePromo} className="text-green-500 hover:text-green-700"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={promoInput} onChange={e => setPromoInput(e.target.value.toUpperCase())}
                    placeholder="Código..." onKeyDown={e => e.key === 'Enter' && applyPromo()}
                    className="flex-1 p-3 border border-gray-300 rounded-lg text-sm font-mono uppercase focus:ring-2 focus:ring-cyan-500" />
                  <button onClick={applyPromo} className="px-4 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-gray-900 transition">
                    <Tag className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Resumo */}
          <div className="border-t pt-4 space-y-2 mb-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{subtotal.toLocaleString('pt-AO')} AOA</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Entrega ({selectedZone?.name})</span>
                <span>{deliveryFee.toLocaleString('pt-AO')} AOA</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-600 font-medium">
                <span>Desconto ({appliedPromo?.code})</span>
                <span>-{discountAmount.toLocaleString('pt-AO')} AOA</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
              <span>Total:</span>
              <span className="text-cyan-600">{cartTotal.toLocaleString('pt-AO')} AOA</span>
            </div>
          </div>

          <button onClick={handleCheckout} disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-semibold hover:from-cyan-700 hover:to-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'A processar...' : 'Confirmar Pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
