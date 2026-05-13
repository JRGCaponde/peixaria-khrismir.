import { useState, useEffect, useCallback } from 'react'
import {
  LogIn, LogOut, Clock, ChevronDown, ChevronUp,
  Banknote, CreditCard, Smartphone, ShoppingBag,
  User, Calendar, TrendingUp, CheckCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../../../../stores/useAuthStore'
import { syncShifts } from '../../../../lib/sync'
import type { ShiftSession, Order } from '../../../../types/database'
import type { CashMovement } from '../lib/types'

/* ── helpers ─────────────────────────────────────────── */
function fmt(n: number | undefined | null) { return (n ?? 0).toLocaleString('pt-AO') + ' AOA' }
function fmtTime(iso: string | undefined | null) {
  if (!iso) return '--:--'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '--:--'
  return d.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso: string | undefined | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDuration(openedAt: string | undefined | null, closedAt?: string): string {
  if (!openedAt) return '—'
  const start = new Date(openedAt).getTime()
  if (isNaN(start)) return '—'
  const end = closedAt ? new Date(closedAt).getTime() : Date.now()
  const mins = Math.floor((end - start) / 60000)
  if (mins < 60) return `${mins}min`
  return `${Math.floor(mins / 60)}h ${mins % 60}min`
}

function loadShifts(): ShiftSession[] {
  try {
    const raw: ShiftSession[] = JSON.parse(localStorage.getItem('khrismir_shifts') || '[]')
    // Filter out corrupt records that have no valid opened_at
    return raw.filter(s => s.id && s.opened_at && !isNaN(new Date(s.opened_at).getTime()))
  } catch { return [] }
}
function saveShifts(s: ShiftSession[]) {
  localStorage.setItem('khrismir_shifts', JSON.stringify(s))
}
function loadOrders(): Order[] {
  try { return JSON.parse(localStorage.getItem('khrismir_orders') || '[]') } catch { return [] }
}
export function getOpenShift(): ShiftSession | null {
  return loadShifts().find(s => !s.closed_at) || null
}

/* ── payment breakdown ───────────────────────────────── */
interface PayBreakdown {
  dinheiro: number
  multicaixa: number
  express: number
  total: number
  count: number
}
function getPaymentBreakdown(orders: Order[]): PayBreakdown {
  const valid = orders.filter(o => o.status !== 'cancelado')
  return {
    dinheiro:   valid.filter(o => o.payment_type === 'dinheiro').reduce((s, o) => s + o.total, 0),
    multicaixa: valid.filter(o => o.payment_type === 'multicaixa').reduce((s, o) => s + o.total, 0),
    express:    valid.filter(o => o.payment_type === 'express').reduce((s, o) => s + o.total, 0),
    total:      valid.reduce((s, o) => s + o.total, 0),
    count:      valid.length,
  }
}
function getShiftOrders(shift: ShiftSession, allOrders: Order[]): Order[] {
  const start = shift.opened_at ? new Date(shift.opened_at).getTime() : NaN
  if (isNaN(start)) return []
  const end   = shift.closed_at ? new Date(shift.closed_at).getTime() : Date.now()
  return allOrders.filter(o => {
    if (o.status === 'cancelado') return false
    const t = new Date(o.created_at).getTime()
    return !isNaN(t) && t >= start && t <= end
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

/* ── PaymentBar ──────────────────────────────────────── */
function PaymentBar({ bd }: { bd: PayBreakdown }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
        <Banknote className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
        <p className="text-xs text-emerald-600 font-medium">Dinheiro</p>
        <p className="font-bold text-emerald-700 text-sm mt-0.5">{fmt(bd.dinheiro)}</p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
        <CreditCard className="w-5 h-5 text-blue-600 mx-auto mb-1" />
        <p className="text-xs text-blue-600 font-medium">Multicaixa</p>
        <p className="font-bold text-blue-700 text-sm mt-0.5">{fmt(bd.multicaixa)}</p>
      </div>
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
        <Smartphone className="w-5 h-5 text-purple-600 mx-auto mb-1" />
        <p className="text-xs text-purple-600 font-medium">Express</p>
        <p className="font-bold text-purple-700 text-sm mt-0.5">{fmt(bd.express)}</p>
      </div>
    </div>
  )
}

/* ── SalesList ───────────────────────────────────────── */
function SalesList({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return <p className="text-center text-gray-400 py-6 text-sm">Sem vendas neste turno</p>
  }
  const payIcon: Record<string, React.ReactNode> = {
    dinheiro:   <Banknote className="w-3.5 h-3.5 text-emerald-600" />,
    multicaixa: <CreditCard className="w-3.5 h-3.5 text-blue-600" />,
    express:    <Smartphone className="w-3.5 h-3.5 text-purple-600" />,
  }
  return (
    <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
      {orders.map(o => (
        <div key={o.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0">{payIcon[o.payment_type] ?? <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{o.order_number}</p>
              <p className="text-xs text-gray-400">{fmtTime(o.created_at)} · {o.items?.length ?? 0} item(s)</p>
            </div>
          </div>
          <p className="text-sm font-bold text-gray-700 flex-shrink-0 ml-2">{fmt(o.total)}</p>
        </div>
      ))}
    </div>
  )
}

/* ── Main TurnoTab ───────────────────────────────────── */
export function TurnoTab({ movements }: { movements: CashMovement[] }) {
  const { user } = useAuthStore()
  const [shifts, setShifts]       = useState<ShiftSession[]>(loadShifts)
  const [orders, setOrders]       = useState<Order[]>(loadOrders)
  const [openShift, setOpenShift] = useState<ShiftSession | null>(() => getOpenShift())
  const [openingBalance, setOpeningBalance] = useState('')
  const [cashCounted, setCashCounted]       = useState('')
  const [closeNotes, setCloseNotes]         = useState('')
  const [showCloseForm, setShowCloseForm]   = useState(false)
  const [expandedShift, setExpandedShift]   = useState<string | null>(null)

  const reload = useCallback(() => {
    const fresh = loadShifts()
    setShifts(fresh)
    setOpenShift(fresh.find(s => !s.closed_at) || null)
    setOrders(loadOrders())
  }, [])

  useEffect(() => {
    window.addEventListener('khrismir:sync', reload)
    return () => window.removeEventListener('khrismir:sync', reload)
  }, [reload])

  const persist = (s: ShiftSession[]) => {
    setShifts(s)
    saveShifts(s)
    syncShifts(s)
  }

  /* ── Abrir turno ── */
  const handleOpen = (e: React.FormEvent) => {
    e.preventDefault()
    if (openShift) { toast.error('Já existe um turno aberto'); return }
    const newShift: ShiftSession = {
      id: Date.now().toString(),
      opened_at: new Date().toISOString(),
      opening_balance: Number(openingBalance),
      opened_by: user?.full_name || 'Desconhecido',
    }
    const updated = [newShift, ...shifts]
    persist(updated)
    setOpenShift(newShift)
    setOpeningBalance('')
    toast.success(`Turno aberto por ${newShift.opened_by}!`)
  }

  /* ── Fechar turno ── */
  const handleClose = (e: React.FormEvent) => {
    e.preventDefault()
    if (!openShift) return
    const counted   = Number(cashCounted)
    const shiftOrds = getShiftOrders(openShift, orders)
    const bd        = getPaymentBreakdown(shiftOrds)
    const shiftInc  = movements
      .filter(m => m.type === 'income' && new Date(m.created_at) >= new Date(openShift.opened_at))
      .reduce((s, m) => s + m.amount, 0)
    const shiftExp  = movements
      .filter(m => m.type === 'expense' && new Date(m.created_at) >= new Date(openShift.opened_at))
      .reduce((s, m) => s + m.amount, 0)
    const expected  = openShift.opening_balance + shiftInc - shiftExp
    const diff      = counted - expected

    const closed: ShiftSession = {
      ...openShift,
      closed_at:       new Date().toISOString(),
      closing_balance: counted,
      cash_counted:    counted,
      difference:      diff,
      closed_by:       user?.full_name || 'Desconhecido',
      notes:           closeNotes || undefined,
    }
    persist(shifts.map(s => s.id === openShift.id ? closed : s))
    setOpenShift(null)
    setShowCloseForm(false)
    setCashCounted('')
    setCloseNotes('')

    if (Math.abs(diff) > 500) {
      toast.warning(`Turno fechado. Diferença: ${diff > 0 ? '+' : ''}${(diff ?? 0).toLocaleString()} AOA`)
    } else {
      toast.success(`Turno fechado! ${bd.count} vendas · ${fmt(bd.total)}`)
    }
  }

  /* ── Dados do turno activo ── */
  const activeOrders = openShift ? getShiftOrders(openShift, orders) : []
  const activeBd     = getPaymentBreakdown(activeOrders)
  const shiftIncome  = openShift
    ? movements.filter(m => m.type === 'income'  && new Date(m.created_at) >= new Date(openShift.opened_at)).reduce((s, m) => s + m.amount, 0)
    : 0
  const shiftExpense = openShift
    ? movements.filter(m => m.type === 'expense' && new Date(m.created_at) >= new Date(openShift.opened_at)).reduce((s, m) => s + m.amount, 0)
    : 0

  const closedShifts = shifts.filter(s => s.closed_at && s.opened_at)
    .sort((a, b) => {
      const ta = new Date(a.opened_at).getTime()
      const tb = new Date(b.opened_at).getTime()
      if (isNaN(tb)) return -1
      if (isNaN(ta)) return 1
      return tb - ta
    })

  return (
    <div className="space-y-6">

      {/* ═══ TURNO ACTIVO ═══════════════════════════════════════════════ */}
      {openShift ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-5">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
              <div>
                <h3 className="text-base font-bold text-green-800 flex items-center gap-2">
                  <User className="w-4 h-4" /> {openShift.opened_by}
                  <span className="text-xs font-normal text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Turno Aberto</span>
                </h3>
                <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {fmtDate(openShift.opened_at)} · desde {fmtTime(openShift.opened_at)} ({fmtDuration(openShift.opened_at)})
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-600 font-medium">Saldo Inicial</p>
              <p className="font-bold text-green-800">{fmt(openShift.opening_balance)}</p>
            </div>
          </div>

          {/* Totais rápidos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-3 text-center border border-green-100">
              <p className="text-xs text-gray-500">Vendas</p>
              <p className="font-black text-green-700 text-lg">{activeBd.count}</p>
            </div>
            <div className="bg-white rounded-xl p-3 text-center border border-green-100">
              <p className="text-xs text-gray-500">Total Vendas</p>
              <p className="font-black text-green-700 text-sm">{fmt(activeBd.total)}</p>
            </div>
            <div className="bg-white rounded-xl p-3 text-center border border-green-100">
              <p className="text-xs text-gray-500">Outras Entradas</p>
              <p className="font-black text-green-700 text-sm">{fmt(shiftIncome - activeBd.total >= 0 ? shiftIncome - activeBd.total : 0)}</p>
            </div>
            <div className="bg-white rounded-xl p-3 text-center border border-green-100">
              <p className="text-xs text-gray-500">Saídas</p>
              <p className="font-black text-red-600 text-sm">{fmt(shiftExpense)}</p>
            </div>
          </div>

          {/* Breakdown por tipo de pagamento */}
          <div>
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Vendas por Tipo de Pagamento</p>
            <PaymentBar bd={activeBd} />
          </div>

          {/* Saldo esperado */}
          <div className="bg-white rounded-xl p-4 flex justify-between items-center border border-green-100">
            <span className="text-sm font-medium text-gray-700">Saldo Esperado em Caixa</span>
            <span className="text-xl font-black text-green-700">{fmt(openShift.opening_balance + shiftIncome - shiftExpense)}</span>
          </div>

          {/* Lista de vendas do turno */}
          <details className="bg-white rounded-xl border border-green-100 overflow-hidden">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none font-semibold text-sm text-gray-700 hover:bg-gray-50">
              <span className="flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-green-600" /> Vendas deste turno ({activeOrders.length})</span>
            </summary>
            <SalesList orders={activeOrders} />
          </details>

          {/* Botão fechar turno */}
          <button
            onClick={() => setShowCloseForm(!showCloseForm)}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" /> {showCloseForm ? 'Cancelar Fecho' : 'Fechar Turno'}
          </button>

          {/* Formulário de fecho */}
          {showCloseForm && (
            <form onSubmit={handleClose} className="pt-4 border-t border-green-200 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-sm">
                <p className="font-bold text-amber-800 mb-2">📊 Resumo do Turno</p>
                <div className="flex justify-between"><span className="text-gray-600">Saldo Inicial</span><span className="font-medium">{fmt(openShift.opening_balance)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Vendas ({activeBd.count})</span><span className="font-medium text-green-700">+{fmt(activeBd.total)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">↳ Dinheiro</span><span className="text-emerald-700">{fmt(activeBd.dinheiro)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">↳ Multicaixa</span><span className="text-blue-700">{fmt(activeBd.multicaixa)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">↳ Express</span><span className="text-purple-700">{fmt(activeBd.express)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Outras Saídas</span><span className="font-medium text-red-600">-{fmt(shiftExpense)}</span></div>
                <div className="flex justify-between border-t pt-2 font-bold"><span>Saldo Esperado</span><span className="text-green-700">{fmt(openShift.opening_balance + shiftIncome - shiftExpense)}</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dinheiro Contado em Caixa (AOA) *</label>
                <input
                  type="number" value={cashCounted} onChange={e => setCashCounted(e.target.value)}
                  placeholder="0" min="0" required
                  className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-red-500 text-lg font-bold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações (opcional)</label>
                <input
                  type="text" value={closeNotes} onChange={e => setCloseNotes(e.target.value)}
                  placeholder="Notas do fecho..." className="w-full border p-3 rounded-xl"
                />
              </div>
              <button type="submit" className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" /> Confirmar Fecho de Turno
              </button>
            </form>
          )}
        </div>

      ) : (
        /* ═══ SEM TURNO ABERTO ══════════════════════════════════════════ */
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-3 h-3 bg-gray-400 rounded-full flex-shrink-0" />
            <h3 className="text-lg font-bold text-gray-700">Sem Turno Aberto</h3>
          </div>
          <form onSubmit={handleOpen} className="space-y-4 max-w-sm">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Saldo Inicial em Caixa (AOA)</label>
              <input
                type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)}
                placeholder="0" min="0" required
                className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-cyan-500 text-lg font-bold"
              />
            </div>
            <button type="submit" className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition flex items-center justify-center gap-2">
              <LogIn className="w-5 h-5" /> Abrir Turno — {user?.full_name || '—'}
            </button>
          </form>
        </div>
      )}

      {/* ═══ HISTÓRICO DE TURNOS ════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center gap-2">
          <Clock className="w-5 h-5 text-cyan-600" />
          <h3 className="font-bold text-gray-800">Histórico de Turnos ({closedShifts.length})</h3>
        </div>

        {closedShifts.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">Nenhum turno fechado ainda</p>
        ) : (
          <div className="divide-y">
            {closedShifts.map(s => {
              const sOrders = getShiftOrders(s, orders)
              const sBd     = getPaymentBreakdown(sOrders)
              const isOpen  = expandedShift === s.id
              const diffOk  = s.difference !== undefined && Math.abs(s.difference) <= 500

              return (
                <div key={s.id} className="hover:bg-gray-50 transition">
                  {/* Cabeçalho do turno no histórico */}
                  <button
                    onClick={() => setExpandedShift(isOpen ? null : s.id)}
                    className="w-full text-left px-6 py-4"
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-cyan-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-cyan-700" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 text-sm">{s.opened_by}</p>
                          <p className="text-xs text-gray-500">
                            {fmtDate(s.opened_at)} · {fmtTime(s.opened_at)} → {s.closed_at ? fmtTime(s.closed_at) : '—'} · {fmtDuration(s.opened_at, s.closed_at)}
                          </p>
                          {s.closed_by && s.closed_by !== s.opened_by && (
                            <p className="text-xs text-gray-400">Fechado por: {s.closed_by}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-gray-400 font-medium">{sBd.count} vendas</p>
                          <p className="font-black text-green-700">{fmt(sBd.total)}</p>
                          {s.difference !== undefined && (
                            <p className={`text-xs font-bold ${diffOk ? 'text-green-600' : 'text-red-600'}`}>
                              {diffOk ? '✓ Caixa OK' : `Diferença: ${(s.difference ?? 0) > 0 ? '+' : ''}${(s.difference ?? 0).toLocaleString()} AOA`}
                            </p>
                          )}
                        </div>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      </div>
                    </div>
                  </button>

                  {/* Detalhe expandido */}
                  {isOpen && (
                    <div className="px-6 pb-5 space-y-4 border-t border-gray-100 pt-4">
                      {/* Breakdown pagamentos */}
                      <PaymentBar bd={sBd} />

                      {/* Resumo financeiro */}
                      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Saldo Inicial</span><span className="font-medium">{fmt(s.opening_balance)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Total Vendas</span><span className="font-medium text-green-700">+{fmt(sBd.total)}</span></div>
                        {s.cash_counted !== undefined && (
                          <>
                            <div className="flex justify-between border-t pt-2"><span className="text-gray-500">Dinheiro Contado</span><span className="font-medium">{fmt(s.cash_counted)}</span></div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Diferença</span>
                              <span className={`font-bold ${diffOk ? 'text-green-600' : 'text-red-600'}`}>
                                {s.difference !== undefined ? `${s.difference >= 0 ? '+' : ''}${s.difference.toLocaleString()} AOA` : '—'}
                              </span>
                            </div>
                          </>
                        )}
                        {s.notes && (
                          <p className="text-xs text-gray-400 italic border-t pt-2">📝 {s.notes}</p>
                        )}
                      </div>

                      {/* Vendas do turno */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <ShoppingBag className="w-3.5 h-3.5" /> Vendas do Turno ({sOrders.length})
                        </p>
                        <div className="border rounded-xl overflow-hidden">
                          <SalesList orders={sOrders} />
                        </div>
                      </div>

                      {/* Indicadores por pagamento + totais */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2 bg-emerald-50 rounded-lg p-2">
                          <Banknote className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <div>
                            <p className="text-gray-500">Dinheiro</p>
                            <p className="font-bold text-emerald-700">{fmt(sBd.dinheiro)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-2">
                          <CreditCard className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                          <div>
                            <p className="text-gray-500">Multicaixa</p>
                            <p className="font-bold text-blue-700">{fmt(sBd.multicaixa)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 bg-purple-50 rounded-lg p-2">
                          <Smartphone className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                          <div>
                            <p className="text-gray-500">Express</p>
                            <p className="font-bold text-purple-700">{fmt(sBd.express)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 bg-green-50 rounded-lg p-2">
                          <TrendingUp className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                          <div>
                            <p className="text-gray-500">Total</p>
                            <p className="font-bold text-green-700">{fmt(sBd.total)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
