import { useState, useEffect, useCallback } from 'react'
import { LogIn, LogOut, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../stores/useAuthStore'
import type { ShiftSession } from '../types/database'
import type { CashMovement } from './CashFlow'
import { syncShifts } from '../lib/sync'

function fmt(n: number) { return n.toLocaleString('pt-AO') + ' AOA' }

function lsShifts(): ShiftSession[] {
  try { return JSON.parse(localStorage.getItem('khrismir_shifts') || '[]') } catch { return [] }
}
function saveShifts(s: ShiftSession[]) { localStorage.setItem('khrismir_shifts', JSON.stringify(s)) }
export function getOpenShift(): ShiftSession | null {
  return lsShifts().find(s => !s.closed_at) || null
}

export function TurnoTab({ movements }: { movements: CashMovement[] }) {
  const { user } = useAuthStore()
  const [shifts, setShifts] = useState<ShiftSession[]>(lsShifts)
  const [openShift, setOpenShift] = useState<ShiftSession | null>(() => getOpenShift())

  // Re-carrega turnos quando o sync actualiza o localStorage
  const reload = useCallback(() => {
    const fresh = lsShifts()
    setShifts(fresh)
    setOpenShift(fresh.find(s => !s.closed_at) || null)
  }, [])

  useEffect(() => {
    window.addEventListener('khrismir:sync', reload)
    return () => window.removeEventListener('khrismir:sync', reload)
  }, [reload])
  const [openingBalance, setOpeningBalance] = useState('')
  const [cashCounted, setCashCounted] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [showCloseForm, setShowCloseForm] = useState(false)

  const persist = (s: ShiftSession[]) => { setShifts(s); saveShifts(s); syncShifts(s) }

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
    toast.success('Turno aberto!')
  }

  const handleClose = (e: React.FormEvent) => {
    e.preventDefault()
    if (!openShift) return
    const counted = Number(cashCounted)
    const inc = movements.filter(m => m.type === 'income' && new Date(m.created_at) >= new Date(openShift.opened_at)).reduce((s, m) => s + m.amount, 0)
    const exp = movements.filter(m => m.type === 'expense' && new Date(m.created_at) >= new Date(openShift.opened_at)).reduce((s, m) => s + m.amount, 0)
    const expected = openShift.opening_balance + inc - exp
    const diff = counted - expected
    const closed: ShiftSession = {
      ...openShift,
      closed_at: new Date().toISOString(),
      closing_balance: counted,
      cash_counted: counted,
      difference: diff,
      closed_by: user?.full_name || 'Desconhecido',
      notes: closeNotes || undefined,
    }
    persist(shifts.map(s => s.id === openShift.id ? closed : s))
    setOpenShift(null)
    setShowCloseForm(false)
    setCashCounted('')
    setCloseNotes('')
    if (Math.abs(diff) > 100) {
      toast.warning(`Turno fechado. Diferença: ${diff > 0 ? '+' : ''}${diff.toLocaleString()} AOA`)
    } else {
      toast.success('Turno fechado com sucesso!')
    }
  }

  const shiftIncome = openShift ? movements.filter(m => m.type === 'income' && new Date(m.created_at) >= new Date(openShift.opened_at)).reduce((s, m) => s + m.amount, 0) : 0
  const shiftExpense = openShift ? movements.filter(m => m.type === 'expense' && new Date(m.created_at) >= new Date(openShift.opened_at)).reduce((s, m) => s + m.amount, 0) : 0

  return (
    <div className="space-y-6">
      {openShift ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <h3 className="text-lg font-bold text-green-800">Turno Aberto — {openShift.opened_by}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div><p className="text-xs text-green-600 font-medium">Abertura</p><p className="font-bold text-green-800">{new Date(openShift.opened_at).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}</p></div>
            <div><p className="text-xs text-green-600 font-medium">Saldo Inicial</p><p className="font-bold text-green-800">{fmt(openShift.opening_balance)}</p></div>
            <div><p className="text-xs text-green-600 font-medium">Entradas</p><p className="font-bold text-green-800">{fmt(shiftIncome)}</p></div>
            <div><p className="text-xs text-green-600 font-medium">Saídas</p><p className="font-bold text-green-800">{fmt(shiftExpense)}</p></div>
          </div>
          <div className="bg-white rounded-xl p-4 flex justify-between items-center mb-4">
            <span className="text-gray-600 font-medium">Saldo Esperado em Caixa</span>
            <span className="text-xl font-black text-green-700">{fmt(openShift.opening_balance + shiftIncome - shiftExpense)}</span>
          </div>
          <button onClick={() => setShowCloseForm(!showCloseForm)}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition flex items-center justify-center gap-2">
            <LogOut className="w-5 h-5" /> Fechar Turno
          </button>
          {showCloseForm && (
            <form onSubmit={handleClose} className="mt-4 space-y-3 pt-4 border-t border-green-200">
              <div>
                <label className="block text-sm font-medium text-green-800 mb-1">Dinheiro Contado em Caixa (AOA)</label>
                <input type="number" value={cashCounted} onChange={e => setCashCounted(e.target.value)} placeholder="0" min="0" required className="w-full border border-green-300 p-3 rounded-xl focus:ring-2 focus:ring-red-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-green-800 mb-1">Observações (opcional)</label>
                <input type="text" value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Notas do fecho..." className="w-full border border-green-300 p-3 rounded-xl" />
              </div>
              <button type="submit" className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition">Confirmar Fecho de Turno</button>
            </form>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 bg-gray-400 rounded-full" />
            <h3 className="text-lg font-bold text-gray-700">Sem Turno Aberto</h3>
          </div>
          <form onSubmit={handleOpen} className="space-y-4 max-w-sm">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Saldo Inicial em Caixa (AOA)</label>
              <input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0" min="0" required className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-cyan-500" />
            </div>
            <button type="submit" className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition flex items-center justify-center gap-2">
              <LogIn className="w-5 h-5" /> Abrir Turno
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-cyan-600" /> Histórico de Turnos</h3>
        {shifts.filter(s => s.closed_at).length === 0 ? (
          <p className="text-center text-gray-400 py-8">Sem turnos fechados ainda</p>
        ) : (
          <div className="space-y-3">
            {shifts.filter(s => s.closed_at).map(s => (
              <div key={s.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-gray-800">{new Date(s.opened_at).toLocaleDateString('pt-AO')} — {s.opened_by}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(s.opened_at).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })} → {s.closed_at ? new Date(s.closed_at).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">Inicial: {fmt(s.opening_balance)}</p>
                    {s.cash_counted !== undefined && <p className="text-sm">Contado: {fmt(s.cash_counted)}</p>}
                    {s.difference !== undefined && (
                      <p className={`text-xs font-bold ${Math.abs(s.difference) < 100 ? 'text-green-600' : 'text-red-600'}`}>
                        {Math.abs(s.difference) < 100 ? 'OK' : `Diferença: ${s.difference > 0 ? '+' : ''}${s.difference.toLocaleString()} AOA`}
                      </p>
                    )}
                  </div>
                </div>
                {s.notes && <p className="text-xs text-gray-400 mt-2 italic">{s.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
