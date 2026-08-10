import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2 } from 'lucide-react'
import type { Order } from '../types/database'
import { settleReceivable, settlePayable } from '../lib/cashflow'
import { syncOrder, syncPurchases } from '../lib/sync'

const fmt = (n: number) => (n ?? 0).toLocaleString('pt-AO') + ' Kz'

interface Props {
  orders: Order[]
  purchases: any[]
  setOrders: (o: Order[]) => void
  setPurchases: (p: any[]) => void
}

export default function AccountsPayableReceivableTab({ orders, purchases, setOrders, setPurchases }: Props) {
  const cfAccounts: any[] = (() => { try { return JSON.parse(localStorage.getItem('cf_accounts') || '[]') } catch { return [] } })()
  const [account, setAccount] = useState(cfAccounts[0]?.name ?? '')

  const receivables = orders.filter(o => o.payment_status === 'pendente')
  const payables = purchases.filter((p: any) => p.payment_status === 'pendente')
  const totalReceivable = receivables.reduce((s, o) => s + o.total, 0)
  const totalPayable = payables.reduce((s: number, p: any) => s + Number(p.total_price), 0)

  const markReceived = (order: Order) => {
    const acc = account || cfAccounts[0]?.name
    if (!acc) { toast.error('Crie uma conta de Caixa/Banco primeiro em Financeiro.'); return }
    settleReceivable(order.id, order.order_number, order.total, acc)
    const updated = orders.map(o => o.id === order.id ? { ...o, payment_status: 'pago' as const, paid_at: new Date().toISOString() } : o)
    setOrders(updated)
    const saved = updated.find(o => o.id === order.id)
    if (saved) syncOrder(saved)
    toast.success(`Recebimento de ${order.order_number} registado em ${acc}!`)
  }

  const markPaid = (purchase: any) => {
    const acc = account || cfAccounts[0]?.name
    if (!acc) { toast.error('Crie uma conta de Caixa/Banco primeiro em Financeiro.'); return }
    settlePayable(purchase.id, purchase.product_name || 'Compra', Number(purchase.total_price), acc)
    const updated = purchases.map((p: any) => p.id === purchase.id ? { ...p, payment_status: 'pago', paid_at: new Date().toISOString() } : p)
    setPurchases(updated)
    const saved = updated.find((p: any) => p.id === purchase.id)
    if (saved) syncPurchases([saved])
    toast.success(`Pagamento de "${purchase.product_name}" registado em ${acc}!`)
  }

  return (
    <div className="space-y-6">
      {cfAccounts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-gray-600">Conta para liquidação:</label>
          <select value={account} onChange={e => setAccount(e.target.value)} className="border p-2 rounded-xl text-sm">
            {cfAccounts.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between bg-green-50">
            <div className="flex items-center gap-2 text-green-700 font-bold"><ArrowDownCircle className="w-5 h-5" /> A Receber</div>
            <span className="text-green-700 font-bold">{fmt(totalReceivable)}</span>
          </div>
          <div className="divide-y max-h-[32rem] overflow-y-auto">
            {receivables.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Sem contas a receber</div>
            ) : receivables.map(o => (
              <div key={o.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{o.customer_name || 'Cliente'}</p>
                  <p className="text-xs text-gray-500">{o.order_number} — {new Date(o.created_at).toLocaleDateString('pt-AO')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-green-700">{fmt(o.total)}</span>
                  <button onClick={() => markReceived(o)} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 transition">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Recebido
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between bg-red-50">
            <div className="flex items-center gap-2 text-red-700 font-bold"><ArrowUpCircle className="w-5 h-5" /> A Pagar</div>
            <span className="text-red-700 font-bold">{fmt(totalPayable)}</span>
          </div>
          <div className="divide-y max-h-[32rem] overflow-y-auto">
            {payables.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Sem contas a pagar</div>
            ) : payables.map((p: any) => (
              <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{p.supplier || 'Fornecedor'}</p>
                  <p className="text-xs text-gray-500">{p.product_name} — {new Date(p.created_at).toLocaleDateString('pt-AO')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-red-700">{fmt(Number(p.total_price))}</span>
                  <button onClick={() => markPaid(p)} className="flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Pago
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
