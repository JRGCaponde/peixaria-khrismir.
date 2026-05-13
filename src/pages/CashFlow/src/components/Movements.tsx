import { useState } from 'react'
import { format } from 'date-fns'
import {
  TrendingUp, TrendingDown, ArrowLeftRight, Plus, Trash2,
  Search, X, Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { Account, Category, CashMovement, fmt } from '../lib/types'
import { calcBalance } from '../lib/utils'
import { syncCfMovements, deleteCfMovement } from '../../../../lib/sync'
import { isSupabaseReady } from '../../../../lib/supabase'

interface MovementsProps {
  movements: CashMovement[]
  setMovements: React.Dispatch<React.SetStateAction<CashMovement[]>>
  accounts: Account[]
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>
  categories: Category[]
}

export function Movements({ movements, setMovements, accounts, setAccounts, categories }: MovementsProps) {
  const [form, setForm] = useState({
    type: 'income' as 'income' | 'expense' | 'transfer',
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    amount: '',
    category: '',
    account: '',
    accountTo: '',
    reference: '',
  })
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterAccount, setFilterAccount] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const filteredCategories = categories.filter(c =>
    form.type === 'transfer' ? false : c.type === (form.type === 'income' ? 'income' : 'expense')
  )

  const add = () => {
    if (!form.description.trim() || !form.amount || !form.account) {
      toast.error('Preencha descrição, valor e conta'); return
    }
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) { toast.error('Valor inválido'); return }
    if (form.type === 'transfer' && !form.accountTo) { toast.error('Selecione a conta destino'); return }
    if (form.type === 'transfer' && form.account === form.accountTo) { toast.error('Contas de origem e destino devem ser diferentes'); return }

    const mv: CashMovement = {
      id: Date.now().toString(),
      date: form.date,
      type: form.type,
      description: form.description.trim(),
      amount,
      category: form.type === 'transfer' ? 'Transferência' : form.category,
      account: form.account,
      accountTo: form.type === 'transfer' ? form.accountTo : undefined,
      reference: form.reference.trim() || undefined,
      created_at: new Date().toISOString(),
    }
    setMovements(prev => [mv, ...prev])
    if (isSupabaseReady()) syncCfMovements([mv])

    setAccounts(prev => prev.map(a => {
      if (a.name === form.account) {
        return { ...a, balance: form.type === 'income' ? a.balance + amount : a.balance - amount }
      }
      if (form.type === 'transfer' && a.name === form.accountTo) {
        return { ...a, balance: a.balance + amount }
      }
      return a
    }))

    setForm(f => ({ ...f, description: '', amount: '', category: '', reference: '' }))
    setShowForm(false)
    toast.success('Movimento registado!')
  }

  const remove = (mv: CashMovement) => {
    if (!confirm(`Eliminar "${mv.description}"? O saldo da conta será ajustado.`)) return
    setMovements(prev => prev.filter(m => m.id !== mv.id))
    if (isSupabaseReady()) deleteCfMovement(mv.id)
    setAccounts(prev => prev.map(a => {
      if (a.name === mv.account) {
        return { ...a, balance: mv.type === 'income' ? a.balance - mv.amount : a.balance + mv.amount }
      }
      if (mv.type === 'transfer' && a.name === mv.accountTo) {
        return { ...a, balance: a.balance - mv.amount }
      }
      return a
    }))
    toast.success('Movimento eliminado')
  }

  const startEditValue = (mv: CashMovement) => {
    setEditingId(mv.id)
    setEditValue(mv.amount.toString())
  }

  const saveEditValue = (mv: CashMovement) => {
    const newAmount = parseFloat(editValue)
    if (isNaN(newAmount) || newAmount < 0) { toast.error('Valor inválido'); return }

    const updatedMv = { ...mv, amount: newAmount }
    setMovements(prev => prev.map(m => m.id === mv.id ? updatedMv : m))

    const affectedNames = new Set([mv.account, mv.accountTo].filter(Boolean) as string[])
    setAccounts(prev => prev.map(a => {
      if (!affectedNames.has(a.name)) return a
      const freshMvs = movements.map(m => m.id === mv.id ? updatedMv : m)
      return { ...a, balance: calcBalance(a.name, freshMvs) }
    }))

    setEditingId(null)
    if (isSupabaseReady()) syncCfMovements([updatedMv])
    toast.success('Valor actualizado!')
  }

  const visible = movements.filter(m => {
    const matchSearch = m.description.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || m.type === filterType
    const matchAccount = filterAccount === 'all' || m.account === filterAccount
    return matchSearch && matchType && matchAccount
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 flex-1">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar..." className="pl-9 pr-4 py-2 border rounded-lg text-sm w-full sm:w-48" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="all">Todos os tipos</option>
            <option value="income">Entradas</option>
            <option value="expense">Saídas</option>
            <option value="transfer">Transferências</option>
          </select>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="all">Todas as contas</option>
            {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
          <Plus className="w-4 h-4" /> Novo Movimento
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Registar Movimento</h3>
            <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'income' | 'expense' | 'transfer', category: '' }))}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="income">Entrada</option>
                <option value="expense">Saída</option>
                <option value="transfer">Transferência</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (AOA) *</label>
              <input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" min="0" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
              <input type="text" placeholder="Descrição do movimento" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referência</label>
              <input type="text" placeholder="Nº fatura, etc." value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{form.type === 'transfer' ? 'Conta Origem *' : 'Conta *'}</label>
              <select value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Selecione</option>
                {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            {form.type === 'transfer' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conta Destino *</label>
                <select value={form.accountTo} onChange={e => setForm(f => ({ ...f, accountTo: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Selecione</option>
                  {accounts.filter(a => a.name !== form.account).map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Sem categoria</option>
                  {filteredCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={add}
              className={`flex-1 py-2.5 rounded-lg text-white text-sm font-medium ${
                form.type === 'income' ? 'bg-green-600 hover:bg-green-700' : form.type === 'expense' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}>
              Registar
            </button>
            <button onClick={() => setShowForm(false)} className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b bg-gray-50 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{visible.length} movimento{visible.length !== 1 ? 's' : ''}</span>
        </div>
        {visible.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">Nenhum movimento encontrado</div>
        ) : (
          <div className="divide-y">
            {visible.map(m => (
              <div key={m.id} className="flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 hover:bg-gray-50">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  m.type === 'income' ? 'bg-green-100' : m.type === 'expense' ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                  {m.type === 'income' ? <TrendingUp className="w-4 h-4 text-green-600" /> : m.type === 'expense' ? <TrendingDown className="w-4 h-4 text-red-600" /> : <ArrowLeftRight className="w-4 h-4 text-blue-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.description}</p>
                  <p className="text-xs text-gray-400">
                    {m.created_at ? format(new Date(m.created_at), 'dd/MM/yyyy HH:mm') : m.date} · {m.account}{m.accountTo ? ` → ${m.accountTo}` : ''}{m.category ? ` · ${m.category}` : ''}{m.reference ? ` · Ref: ${m.reference}` : ''}
                  </p>
                </div>
                {editingId === m.id ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEditValue(m); if (e.key === 'Escape') setEditingId(null) }}
                      autoFocus className="w-24 px-2 py-1 border border-cyan-400 rounded text-sm text-right" min="0" />
                    <button onClick={() => saveEditValue(m)} className="text-cyan-600 hover:text-cyan-800">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => startEditValue(m)}
                    className={`text-sm font-bold flex-shrink-0 hover:underline cursor-pointer ${m.type === 'income' ? 'text-green-600' : m.type === 'expense' ? 'text-red-600' : 'text-blue-600'}`}
                    title="Clique para editar o valor">
                    {m.type === 'income' ? '+' : m.type === 'expense' ? '-' : ''}{fmt(m.amount)}
                  </button>
                )}
                {accounts.length > 1 && m.type !== 'transfer' && (
                  <div className="flex-shrink-0 relative group/move hidden sm:block">
                    <select
                      value={m.account}
                      onChange={e => {
                        const newAcc = e.target.value
                        if (newAcc === m.account) return
                        const updated = { ...m, account: newAcc }
                        setMovements(prev => prev.map(x => x.id === m.id ? updated : x))
                        const affected = new Set([m.account, newAcc])
                        setAccounts(prev => prev.map(a => {
                          if (!affected.has(a.name)) return a
                          const freshMvs = movements.map(x => x.id === m.id ? updated : x)
                          return { ...a, balance: calcBalance(a.name, freshMvs) }
                        }))
                        toast.success(`Movido para "${newAcc}"`)
                      }}
                      title="Mover para outra conta"
                      className="px-2 py-1 border rounded-lg text-xs text-gray-600 bg-white hover:border-cyan-400 cursor-pointer"
                    >
                      {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                    </select>
                  </div>
                )}
                <button onClick={() => remove(m)} className="text-gray-300 hover:text-red-500 transition flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
