import { useState } from 'react'
import { toast } from 'sonner'
import { FileText, FileClock, Printer, ArrowRightLeft, X, Trash2, Search, Save, Ban } from 'lucide-react'
import { supabase, isSupabaseReady } from '../lib/supabase'
import { useStore } from '../lib/storeContext'
import { getSettings } from '../lib/settings'
import { calcOrderHash } from '../utils/saft'
import { printBusinessInvoice } from '../utils/invoice'
import { registerSaleMovement, registerCreditSale } from '../lib/cashflow'
import { syncOrder, syncProductStock } from '../lib/sync'
import { notifyDataChange } from '../lib/realtime'
import type { Order, OrderItem, Product, PaymentType, PreparationType } from '../types/database'

const fmt = (n: number) => (n ?? 0).toLocaleString('pt-AO') + ' Kz'

type DocType = 'FA' | 'FP'

interface ClientLite { id: string; full_name: string; company_name?: string | null; tax_id?: string | null; phone?: string | null; address?: string | null }

function loadOrders(): Order[] {
  try { return JSON.parse(localStorage.getItem('khrismir_orders') || '[]') } catch { return [] }
}
function saveOrders(o: Order[]) { localStorage.setItem('khrismir_orders', JSON.stringify(o)) }

function loadClients(): ClientLite[] {
  try { return JSON.parse(localStorage.getItem('khrismir_clients') || '[]') } catch { return [] }
}

// O número guardado leva a série à frente ("FA 2026/001", "FP 2026/001"). O POS usa
// "2026/001" com outro contador, e a base de dados exige números de encomenda únicos:
// sem a série, a factura FA 2026/001 batia com a venda POS 2026/001 e nunca chegava à
// nuvem. O número impresso não muda (já era "FA 2026/001").
function nextDocNumber(docType: DocType): string {
  const key = docType === 'FA' ? 'khrismir_fa_counter' : 'khrismir_fp_counter'
  const year = new Date().getFullYear()
  try {
    const counter = JSON.parse(localStorage.getItem(key) || 'null')
    const seq = counter?.year === year ? counter.next : 1
    localStorage.setItem(key, JSON.stringify({ year, next: seq + 1 }))
    return `${docType} ${year}/${String(seq).padStart(3, '0')}`
  } catch {
    localStorage.setItem(key, JSON.stringify({ year, next: 2 }))
    return `${docType} ${year}/001`
  }
}

export default function InvoicesTab({ products, setProducts }: { products: Product[]; setProducts: (p: Product[]) => void }) {
  const { store } = useStore()
  const [orders, setOrders] = useState<Order[]>(() => loadOrders().filter(o => o.doc_type))
  const [filter, setFilter] = useState<'all' | DocType>('all')
  const [modal, setModal] = useState<DocType | null>(null)

  const refresh = () => setOrders(loadOrders().filter(o => o.doc_type))

  const persistOrder = (order: Order) => {
    const all = loadOrders()
    all.unshift(order)
    saveOrders(all)
    syncOrder(order)
    refresh()
  }

  // Dá baixa no stock — só chamado para FA (venda real). A FP (proforma) não move mercadoria.
  const decrementStock = (items: OrderItem[]) => {
    const stored: Product[] = JSON.parse(localStorage.getItem('khrismir_products') || '[]')
    items.forEach(item => {
      const idx = stored.findIndex(p => p.id === item.product_id)
      if (idx !== -1) stored[idx] = { ...stored[idx], stock_quantity: Math.max(0, stored[idx].stock_quantity - item.quantity) }
    })
    localStorage.setItem('khrismir_products', JSON.stringify(stored))
    setProducts(stored)
    ;(async () => {
      for (const item of items) {
        await syncProductStock(item.product_id, item.quantity)
      }
      notifyDataChange('products')
    })()
  }

  const printOrder = (order: Order) => printBusinessInvoice(order, getSettings())

  const convertToFA = (fp: Order) => {
    if (!confirm(`Converter ${fp.order_number} em Factura definitiva?`)) return
    const isCredit = confirm('Esta factura é a crédito (fiado)? OK = Fiado, Cancelar = Pagamento imediato')
    const docNumber = nextDocNumber('FA')
    const orderId = crypto.randomUUID()
    const base = {
      id: orderId,
      order_number: docNumber,
      customer_id: fp.customer_id,
      customer_name: fp.customer_name,
      customer_phone: fp.customer_phone,
      customer_nif: fp.customer_nif,
      status: 'entregue' as const,
      payment_type: fp.payment_type,
      payment_status: (isCredit ? 'pendente' : 'pago') as 'pago' | 'pendente',
      delivery_type: 'retirada' as const,
      subtotal: fp.subtotal,
      total: fp.total,
      items: fp.items,
      doc_type: 'FA' as const,
      converted_from_order_id: fp.id,
      created_at: new Date().toISOString(),
    }
    const fa: Order = { ...base, hash: calcOrderHash(base) }
    persistOrder(fa)
    if (isCredit) {
      registerCreditSale(fa.id, fa.order_number, fa.total)
    } else {
      registerSaleMovement(fa.total, fa.order_number, fa.payment_type, fa.id)
    }
    decrementStock(fa.items)

    const all = loadOrders().map(o => o.id === fp.id ? { ...o, converted_to_order_id: orderId } : o)
    saveOrders(all)
    syncOrder(all.find(o => o.id === fp.id)!)
    refresh()
    toast.success(`Factura ${docNumber} criada a partir da proforma!`)
  }

  const filtered = orders.filter(o => filter === 'all' || o.doc_type === filter)

  const docLabel: Record<DocType, string> = { FA: 'Factura', FP: 'Factura Proforma' }
  const docIcon: Record<DocType, React.ElementType> = { FA: FileText, FP: FileClock }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex gap-2">
          {(['all', 'FA', 'FP'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === f ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? 'Todas' : docLabel[f]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('FP')} className="flex items-center gap-1.5 bg-amber-500 text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-amber-600 transition">
            <FileClock className="w-4 h-4" /> Nova Proforma
          </button>
          <button onClick={() => setModal('FA')} className="flex items-center gap-1.5 bg-cyan-600 text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-cyan-700 transition">
            <FileText className="w-4 h-4" /> Nova Factura
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">Nenhuma factura ainda</p>
        ) : (
          <div className="divide-y">
            {filtered.map(o => {
              const Icon = docIcon[o.doc_type as DocType]
              return (
                <div key={o.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${o.doc_type === 'FP' ? 'bg-amber-100 text-amber-600' : 'bg-cyan-100 text-cyan-600'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate flex items-center gap-1.5">
                        <span>{o.order_number.startsWith(`${o.doc_type} `) ? o.order_number : `${o.doc_type} ${o.order_number}`} — {o.customer_name || 'Consumidor Final'}</span>
                        {o.payment_status === 'pendente' && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 shrink-0">FIADO</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('pt-AO')} {o.converted_to_order_id ? '· convertida em factura' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-sm">{fmt(o.total)}</span>
                    <button onClick={() => printOrder(o)} className="p-2 text-gray-400 hover:text-cyan-600 transition" title="Imprimir"><Printer className="w-4 h-4" /></button>
                    {o.doc_type === 'FP' && !o.converted_to_order_id && (
                      <button onClick={() => convertToFA(o)} className="flex items-center gap-1.5 bg-cyan-50 text-cyan-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-cyan-100 transition">
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Converter em Factura
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <InvoiceForm
          docType={modal}
          products={products}
          storeId={store?.id}
          onClose={() => setModal(null)}
          onCreated={(order, doPrint) => {
            persistOrder(order)
            if (order.doc_type === 'FA') {
              if (order.payment_status === 'pendente') {
                registerCreditSale(order.id, order.order_number, order.total)
              } else {
                registerSaleMovement(order.total, order.order_number, order.payment_type, order.id)
              }
              decrementStock(order.items)
            }
            setModal(null)
            if (doPrint) printOrder(order)
            toast.success(`${docLabel[order.doc_type as DocType]} ${order.order_number} criada!`)
          }}
        />
      )}
    </div>
  )
}

/* ─── FORMULÁRIO ─── */
function InvoiceForm({ docType, products, storeId, onClose, onCreated }: {
  docType: DocType; products: Product[]; storeId?: string
  onClose: () => void; onCreated: (order: Order, print: boolean) => void
}) {
  const [clients, setClients] = useState<ClientLite[]>(loadClients)
  const [clientId, setClientId] = useState('')
  const [addingClient, setAddingClient] = useState(false)
  const [newClient, setNewClient] = useState({ full_name: '', tax_id: '', phone: '', address: '' })
  const [productSearch, setProductSearch] = useState('')
  const [lines, setLines] = useState<{ product: Product; quantity: number; unit_price: number }[]>([])
  const [paymentType, setPaymentType] = useState<PaymentType>('dinheiro')
  const [isCredit, setIsCredit] = useState(false)
  const [saving, setSaving] = useState(false)

  const client = clients.find(c => c.id === clientId)
  const matchingProducts = productSearch.length > 0
    ? products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.barcode ?? '').toLowerCase().includes(productSearch.toLowerCase())).slice(0, 8)
    : []

  const addLine = (p: Product) => {
    setLines(ls => ls.some(l => l.product.id === p.id) ? ls : [...ls, { product: p, quantity: 1, unit_price: p.price }])
    setProductSearch('')
  }
  const updateLine = (idx: number, patch: Partial<{ quantity: number; unit_price: number }>) => {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }
  const removeLine = (idx: number) => setLines(ls => ls.filter((_, i) => i !== idx))

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const ivaRate = getSettings().iva_rate ?? 0
  const netTotal = total / (1 + ivaRate / 100)
  const ivaTotal = total - netTotal

  const saveNewClient = async () => {
    if (!newClient.full_name.trim()) { toast.error('Indique o nome do cliente'); return }
    const row = {
      store_id: storeId,
      full_name: newClient.full_name.trim(),
      company_name: newClient.full_name.trim(),
      tax_id: newClient.tax_id || null,
      phone: newClient.phone || null,
      address: newClient.address || null,
    }
    let created: ClientLite = { id: crypto.randomUUID(), ...row }
    if (isSupabaseReady() && supabase) {
      const { data, error } = await supabase.from('clients').insert(row).select('id').maybeSingle()
      if (error) { toast.error('Erro ao criar cliente: ' + error.message); return }
      if (data) created = { ...created, id: data.id }
    }
    const updated = [...clients, created]
    setClients(updated)
    localStorage.setItem('khrismir_clients', JSON.stringify(updated))
    setClientId(created.id)
    setAddingClient(false)
    setNewClient({ full_name: '', tax_id: '', phone: '', address: '' })
    toast.success('Cliente criado!')
  }

  const submit = () => {
    if (!client) { toast.error('Seleccione um cliente'); return }
    if (lines.length === 0) { toast.error('Adicione pelo menos um produto'); return }
    setSaving(true)

    const orderId = crypto.randomUUID()
    const docNumber = nextDocNumber(docType)
    const items: OrderItem[] = lines.map(l => ({
      id: crypto.randomUUID(), order_id: orderId, product_id: l.product.id,
      product_name: l.product.name, quantity: l.quantity, unit_price: l.unit_price,
      preparation: 'inteiro' as PreparationType, total_price: l.quantity * l.unit_price,
    }))

    const base = {
      id: orderId,
      order_number: docNumber,
      customer_id: client.id,
      customer_name: client.full_name,
      customer_phone: client.phone ?? undefined,
      customer_nif: client.tax_id ?? undefined,
      status: 'entregue' as const,
      payment_type: paymentType,
      payment_status: (docType === 'FA' && isCredit ? 'pendente' : 'pago') as 'pago' | 'pendente',
      delivery_type: 'retirada' as const,
      subtotal: total,
      total,
      items,
      doc_type: docType,
      created_at: new Date().toISOString(),
    }
    const order: Order = docType === 'FA' ? { ...base, hash: calcOrderHash(base) } : base

    onCreated(order, true)
    setSaving(false)
  }

  const docNumberPreview = `${docType} ${new Date().getFullYear()}/…`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8 overflow-hidden">
        {/* Barra de título — estilo documento */}
        <div className={`px-6 py-3.5 flex items-center justify-between text-white ${docType === 'FA' ? 'bg-gradient-to-r from-cyan-700 via-cyan-600 to-blue-700' : 'bg-gradient-to-r from-amber-600 to-orange-500'}`}>
          <div className="flex items-center gap-3">
            <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-black tracking-wide">{docType}</span>
            <h3 className="text-lg font-bold">{docType === 'FA' ? 'Editor de Factura' : 'Editor de Factura Proforma'}</h3>
            <span className="text-xs text-white/70 font-mono hidden sm:inline">{docNumberPreview}</span>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-lg transition"><X className="w-5 h-5" /></button>
        </div>

        {/* Barra de ferramentas */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-700 transition disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? 'A gravar…' : 'Gravar'}
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-200 transition">
            <Ban className="w-3.5 h-3.5" /> Cancelar
          </button>
          <span className="ml-auto text-xs text-gray-400">Data: {new Date().toLocaleDateString('pt-AO')}</span>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Coluna do documento (Entidade) */}
            <div className="lg:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Entidade (Cliente)</label>
                {!addingClient ? (
                  <div className="flex gap-2">
                    <select value={clientId} onChange={e => setClientId(e.target.value)} className="flex-1 border p-2.5 rounded-xl text-sm">
                      <option value="">Seleccionar cliente…</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.tax_id ? ` — NIF ${c.tax_id}` : ''}</option>)}
                    </select>
                    <button onClick={() => setAddingClient(true)} className="px-3 border rounded-xl text-sm font-medium hover:bg-gray-50 whitespace-nowrap">+ Novo</button>
                  </div>
                ) : (
                  <div className="border border-dashed border-cyan-300 rounded-xl p-3 space-y-2 bg-cyan-50/40">
                    <input value={newClient.full_name} onChange={e => setNewClient(f => ({ ...f, full_name: e.target.value }))} placeholder="Nome / Empresa" className="w-full border p-2 rounded-lg text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={newClient.tax_id} onChange={e => setNewClient(f => ({ ...f, tax_id: e.target.value }))} placeholder="NIF (Contribuinte)" className="border p-2 rounded-lg text-sm" />
                      <input value={newClient.phone} onChange={e => setNewClient(f => ({ ...f, phone: e.target.value }))} placeholder="Telefone" className="border p-2 rounded-lg text-sm" />
                    </div>
                    <input value={newClient.address} onChange={e => setNewClient(f => ({ ...f, address: e.target.value }))} placeholder="Morada (opcional)" className="w-full border p-2 rounded-lg text-sm" />
                    <div className="flex gap-2">
                      <button onClick={saveNewClient} className="flex-1 bg-cyan-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-cyan-700 transition">Guardar Cliente</button>
                      <button onClick={() => setAddingClient(false)} className="px-3 border rounded-lg text-sm">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
              {client && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <span className="font-medium text-gray-600">Contribuinte:</span> {client.tax_id || '—'}
                  {client.phone && <span className="ml-3"><span className="font-medium text-gray-600">Tel:</span> {client.phone}</span>}
                </div>
              )}

              {docType === 'FA' && (
                <div className="space-y-2">
                  {!isCredit && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Forma de Pagamento</label>
                      <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} className="w-full border p-2.5 rounded-xl text-sm">
                        <option value="dinheiro">Dinheiro</option>
                        <option value="multicaixa">Multicaixa</option>
                        <option value="express">Express</option>
                      </select>
                    </div>
                  )}
                  <label className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 cursor-pointer">
                    <input type="checkbox" checked={isCredit} onChange={e => setIsCredit(e.target.checked)} className="w-4 h-4" />
                    <span>🧾 Factura a Crédito (Fiado — vai para Contas a Receber)</span>
                  </label>
                </div>
              )}
            </div>

            {/* Painel de Totais (estilo Primavera) */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2 h-fit">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Merc./Serv.</span>
                <span className="font-medium">{fmt(netTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">IVA ({ivaRate}%)</span>
                <span className="font-medium">{fmt(ivaTotal)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="font-bold text-gray-700">Total</span>
                <span className="font-black text-lg text-cyan-700">{fmt(total)}</span>
              </div>
            </div>
          </div>

          {/* Tabela de Artigos */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Artigos</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input value={productSearch} onChange={e => {
                const val = e.target.value
                setProductSearch(val)
                const match = products.find(p => p.barcode && p.barcode === val.trim())
                if (match) addLine(match)
              }} placeholder="Procurar produto ou ler código de barras…"
                className="w-full pl-9 border p-2.5 rounded-xl text-sm" />
              {matchingProducts.length > 0 && (
                <div className="absolute z-10 w-full bg-white border rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {matchingProducts.map(p => (
                    <button key={p.id} onClick={() => addLine(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between">
                      <span>{p.name} {p.barcode ? <span className="text-gray-400 text-xs">· {p.barcode}</span> : null}</span>
                      <span className="text-gray-400">{fmt(p.price)}/{p.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lines.length > 0 && (
              <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[640px]">
                  <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
                    <tr>
                      <th className="p-2.5">Artigo</th>
                      <th className="p-2.5">Cód. Barras</th>
                      <th className="p-2.5 text-right w-24">Qtd.</th>
                      <th className="p-2.5 text-right w-28">Pr. Unit.</th>
                      <th className="p-2.5 text-right w-28">Total</th>
                      <th className="p-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((l, i) => (
                      <tr key={l.product.id} className={i % 2 === 1 ? 'bg-cyan-50/30' : ''}>
                        <td className="p-2.5 font-medium">{l.product.name}</td>
                        <td className="p-2.5 text-xs text-gray-400">{l.product.barcode || '—'}</td>
                        <td className="p-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input type="number" min="0" step="0.01" value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) })}
                              className="w-16 border p-1.5 rounded-lg text-xs text-right" />
                            <span className="text-xs text-gray-400">{l.product.unit}</span>
                          </div>
                        </td>
                        <td className="p-2.5 text-right">
                          <input type="number" min="0" value={l.unit_price} onChange={e => updateLine(i, { unit_price: Number(e.target.value) })}
                            className="w-24 border p-1.5 rounded-lg text-xs text-right" />
                        </td>
                        <td className="p-2.5 text-right font-bold">{fmt(l.quantity * l.unit_price)}</td>
                        <td className="p-2.5 text-center">
                          <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
