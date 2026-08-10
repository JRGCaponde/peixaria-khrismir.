import { useState, useMemo } from 'react'
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { Account, Category, CashMovement, fmt } from '../lib/types'

interface ReportsProps {
  movements: CashMovement[]
  categories: Category[]
  accounts: Account[]
}

export function Reports({ movements, categories, accounts }: ReportsProps) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [end, setEnd] = useState(today)
  const [preset, setPreset] = useState('month')

  const applyPreset = (p: string) => {
    const now = new Date()
    setPreset(p)
    if (p === 'today') { setStart(today); setEnd(today) }
    else if (p === 'week') { setStart(format(subDays(now, 6), 'yyyy-MM-dd')); setEnd(today) }
    else if (p === 'month') { setStart(format(startOfMonth(now), 'yyyy-MM-dd')); setEnd(format(endOfMonth(now), 'yyyy-MM-dd')) }
    else if (p === 'year') { setStart(format(startOfYear(now), 'yyyy-MM-dd')); setEnd(format(endOfYear(now), 'yyyy-MM-dd')) }
  }

  const filtered = useMemo(() => movements.filter(m => m.date >= start && m.date <= end), [movements, start, end])
  const income = filtered.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0)
  const expense = filtered.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0)
  const net = income - expense

  const byCategory = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {}
    filtered.forEach(m => {
      if (m.type === 'transfer') return
      if (!map[m.category]) map[m.category] = { income: 0, expense: 0 }
      map[m.category][m.type === 'income' ? 'income' : 'expense'] += m.amount
    })
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => (b.income + b.expense) - (a.income + a.expense))
  }, [filtered])

  const byAccount = useMemo(() => accounts.map(a => ({
    name: a.name,
    income: filtered.filter(m => m.account === a.name && m.type === 'income').reduce((s, m) => s + m.amount, 0),
    expense: filtered.filter(m => m.account === a.name && m.type === 'expense').reduce((s, m) => s + m.amount, 0),
    balance: a.balance,
  })), [filtered, accounts])

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary
    const summary = [
      ['RELATÓRIO DE FLUXO DE CAIXA', ''],
      ['Período:', `${start} a ${end}`],
      ['Gerado em:', format(new Date(), 'dd/MM/yyyy HH:mm')],
      [],
      ['RESUMO', ''],
      ['Total Entradas (AOA):', income],
      ['Total Saídas (AOA):', expense],
      ['Resultado (AOA):', net],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Resumo')

    // Sheet 2: Movements
    const mvRows = [['Data', 'Tipo', 'Descrição', 'Conta', 'Categoria', 'Valor (AOA)', 'Referência'],
      ...filtered.map(m => [m.date, m.type === 'income' ? 'Entrada' : m.type === 'expense' ? 'Saída' : 'Transferência', m.description, m.account + (m.accountTo ? ` → ${m.accountTo}` : ''), m.category, m.amount, m.reference || ''])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mvRows), 'Movimentos')

    // Sheet 3: By category
    const catRows = [['Categoria', 'Entradas (AOA)', 'Saídas (AOA)'], ...byCategory.map(c => [c.name, c.income, c.expense])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catRows), 'Por Categoria')

    // Sheet 4: By account
    const accRows = [['Conta', 'Entradas (AOA)', 'Saídas (AOA)', 'Saldo Atual (AOA)'], ...byAccount.map(a => [a.name, a.income, a.expense, a.balance])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(accRows), 'Por Conta')

    XLSX.writeFile(wb, `fluxo-caixa-${start}-a-${end}.xlsx`)
    toast.success('Relatório Excel exportado!')
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 mb-4">
          {[{ id: 'today', label: 'Hoje' }, { id: 'week', label: 'Últimos 7 dias' }, { id: 'month', label: 'Este mês' }, { id: 'year', label: 'Este ano' }, { id: 'custom', label: 'Personalizado' }].map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${preset === p.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Data início</label>
            <input type="date" value={start} onChange={e => { setStart(e.target.value); setPreset('custom') }}
              className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Data fim</label>
            <input type="date" value={end} onChange={e => { setEnd(e.target.value); setPreset('custom') }}
              className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <button onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 ml-auto">
            <Download className="w-4 h-4" /> Exportar Excel
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <p className="text-green-600 text-sm font-medium">Total Entradas</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{fmt(income)}</p>
          <p className="text-xs text-green-500 mt-1">{filtered.filter(m => m.type === 'income').length} movimentos</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="text-red-600 text-sm font-medium">Total Saídas</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{fmt(expense)}</p>
          <p className="text-xs text-red-500 mt-1">{filtered.filter(m => m.type === 'expense').length} movimentos</p>
        </div>
        <div className={`border rounded-xl p-5 ${net >= 0 ? 'bg-cyan-50 border-cyan-200' : 'bg-orange-50 border-orange-200'}`}>
          <p className={`text-sm font-medium ${net >= 0 ? 'text-cyan-600' : 'text-orange-600'}`}>Resultado</p>
          <p className={`text-2xl font-bold mt-1 ${net >= 0 ? 'text-cyan-700' : 'text-orange-700'}`}>{fmt(net)}</p>
          <p className={`text-xs mt-1 ${net >= 0 ? 'text-cyan-500' : 'text-orange-500'}`}>{net >= 0 ? 'Positivo' : 'Negativo'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By category */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Por Categoria</h3>
          {byCategory.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sem dados no período</p>
          ) : (
            <div className="space-y-2">
              {byCategory.map(cat => {
                const catObj = categories.find(c => c.name === cat.name)
                return (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: catObj?.color || '#6b7280' }} />
                    <span className="text-sm flex-1 truncate text-gray-700">{cat.name}</span>
                    {(cat.income ?? 0) > 0 && <span className="text-xs text-green-600 font-medium">+{(cat.income ?? 0).toLocaleString()}</span>}
                    {(cat.expense ?? 0) > 0 && <span className="text-xs text-red-600 font-medium">-{(cat.expense ?? 0).toLocaleString()}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* By account */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Por Conta</h3>
          {byAccount.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma conta criada</p>
          ) : (
            <div className="space-y-3">
              {byAccount.map(a => (
                <div key={a.name} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800">{a.name}</span>
                    <span className="text-sm font-bold text-gray-900">{fmt(a.balance)}</span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-green-600">+{(a.income ?? 0).toLocaleString()} AOA entradas</span>
                    <span className="text-red-600">-{(a.expense ?? 0).toLocaleString()} AOA saídas</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full movement table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-800">Detalhe dos Movimentos ({filtered.length})</h3>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum movimento no período</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Data', 'Tipo', 'Descrição', 'Conta', 'Categoria', 'Valor'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{m.created_at ? format(new Date(m.created_at), 'dd/MM/yyyy HH:mm') : m.date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.type === 'income' ? 'bg-green-100 text-green-700' : m.type === 'expense' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {m.type === 'income' ? 'Entrada' : m.type === 'expense' ? 'Saída' : 'Transferência'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{m.description}</td>
                    <td className="px-4 py-3 text-gray-600">{m.account}{m.accountTo ? ` → ${m.accountTo}` : ''}</td>
                    <td className="px-4 py-3 text-gray-500">{m.category || '—'}</td>
                    <td className={`px-4 py-3 font-semibold ${m.type === 'income' ? 'text-green-600' : m.type === 'expense' ? 'text-red-600' : 'text-blue-600'}`}>
                      {m.type === 'income' ? '+' : m.type === 'expense' ? '-' : ''}{fmt(m.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
