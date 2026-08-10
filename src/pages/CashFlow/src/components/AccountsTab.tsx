import { useState, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, ArrowLeftRight, Plus, Trash2,
  Wallet, X, Check, ChevronDown, ChevronUp, Pencil,
  Banknote, Smartphone, Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Account, Category, CashMovement, fmt, ACCOUNT_COLORS } from '../lib/types'
import { calcBalance } from '../lib/utils'
import { syncCfAccounts, deleteCfAccount } from '../../../../lib/sync'
import { isSupabaseReady } from '../../../../lib/supabase'

interface AccountsTabProps {
  accounts: Account[]
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>
  movements: CashMovement[]
  setMovements: React.Dispatch<React.SetStateAction<CashMovement[]>>
  categories: Category[]
}

export function AccountsTab({ accounts, setAccounts, movements, setMovements, categories }: AccountsTabProps) {
  const [form, setForm] = useState({ name: '', type: 'cash' as 'cash' | 'bank' | 'mobile', color: ACCOUNT_COLORS[0] })
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingMvId, setEditingMvId] = useState<string | null>(null)
  const [editMvForm, setEditMvForm] = useState({ amount: '', description: '', category: '', account: '', accountTo: '' })

  // Detecta nomes de contas referenciados nos movimentos mas que ainda não têm conta criada
  const orphanAccounts = useMemo(() => {
    const existingNames = new Set(accounts.map(a => a.name.toLowerCase()))
    const namesInMovements = new Set<string>()
    movements.forEach(m => {
      if (m.account) namesInMovements.add(m.account)
      if (m.accountTo) namesInMovements.add(m.accountTo)
    })
    return [...namesInMovements].filter(n => !existingNames.has(n.toLowerCase()))
  }, [accounts, movements])

  const add = () => {
    if (!form.name.trim()) { toast.error('Digite o nome da conta'); return }
    if (accounts.find(a => a.name.toLowerCase() === form.name.toLowerCase())) { toast.error('Já existe uma conta com esse nome'); return }

    const name = form.name.trim()
    const balance = calcBalance(name, movements)

    const newAcc: Account = {
      id: Date.now().toString(),
      name,
      type: form.type,
      balance,
      color: form.color,
    }
    setAccounts(prev => {
      const updated = [...prev, newAcc]
      if (isSupabaseReady()) syncCfAccounts(updated)
      return updated
    })
    setForm({ name: '', type: 'cash', color: ACCOUNT_COLORS[0] })
    setShowForm(false)
    const mvCount = movements.filter(m => m.account === name || m.accountTo === name).length
    toast.success(mvCount > 0 ? `Conta criada com ${mvCount} movimentos ligados!` : 'Conta criada!')
  }

  const addOrphan = (name: string, type: 'cash' | 'bank' | 'mobile', color: string) => {
    const balance = calcBalance(name, movements)
    const mvCount = movements.filter(m => m.account === name || m.accountTo === name).length
    setAccounts(prev => [...prev, {
      id: Date.now().toString(),
      name,
      type,
      balance,
      color,
    }])
    toast.success(`Conta "${name}" criada com ${mvCount} movimentos ligados!`)
  }

  const remove = (acc: Account) => {
    if (!confirm(`Eliminar a conta "${acc.name}"?`)) return
    setAccounts(prev => {
      const updated = prev.filter(a => a.id !== acc.id)
      if (isSupabaseReady()) { deleteCfAccount(acc.id); syncCfAccounts(updated) }
      return updated
    })
    toast.success('Conta eliminada')
  }

  const recalcAll = () => {
    setAccounts(prev => prev.map(a => ({ ...a, balance: calcBalance(a.name, movements) })))
    toast.success('Saldos recalculados com base nos movimentos!')
  }

  const startEditMv = (mv: CashMovement) => {
    setEditingMvId(mv.id)
    setEditMvForm({
      amount: mv.amount.toString(),
      description: mv.description,
      category: mv.category,
      account: mv.account,
      accountTo: mv.accountTo || '',
    })
  }

  const saveEditMv = (mv: CashMovement) => {
    const newAmount = parseFloat(editMvForm.amount)
    if (isNaN(newAmount) || newAmount < 0) { toast.error('Valor inválido'); return }
    if (!editMvForm.account) { toast.error('Selecione uma conta'); return }
    if (mv.type === 'transfer' && !editMvForm.accountTo) { toast.error('Selecione a conta destino'); return }
    if (mv.type === 'transfer' && editMvForm.account === editMvForm.accountTo) { toast.error('Contas devem ser diferentes'); return }

    const updated: CashMovement = {
      ...mv,
      amount: newAmount,
      description: editMvForm.description.trim() || mv.description,
      category: editMvForm.category || mv.category,
      account: editMvForm.account,
      accountTo: mv.type === 'transfer' ? editMvForm.accountTo : mv.accountTo,
    }

    // 1. Actualizar movimentos
    setMovements(prev => prev.map(m => m.id === mv.id ? updated : m))

    // 2. Recalcular saldos com os movimentos frescos
    const affectedNames = new Set([mv.account, updated.account, mv.accountTo, updated.accountTo].filter(Boolean) as string[])
    setAccounts(prev => prev.map(a => {
      if (!affectedNames.has(a.name)) return a
      const freshMvs = movements.map(m => m.id === mv.id ? updated : m)
      return { ...a, balance: calcBalance(a.name, freshMvs) }
    }))

    setEditingMvId(null)
    toast.success('Movimento actualizado!')
  }

  const moveToAccount = (mv: CashMovement, newAccount: string) => {
    if (newAccount === mv.account) return
    const updated: CashMovement = { ...mv, account: newAccount }

    setMovements(prev => prev.map(m => m.id === mv.id ? updated : m))

    const affectedNames = new Set([mv.account, newAccount])
    setAccounts(prev => prev.map(a => {
      if (!affectedNames.has(a.name)) return a
      const freshMvs = movements.map(m => m.id === mv.id ? updated : m)
      return { ...a, balance: calcBalance(a.name, freshMvs) }
    }))

    toast.success(`Movido para "${newAccount}"`)
  }

  const accountLabels: Record<string, string> = { cash: 'Caixa', bank: 'Banco', mobile: 'Mobile Money' }
  const AccountIcon: Record<string, typeof Banknote> = { cash: Banknote, bank: Building2, mobile: Smartphone }

  return (
    <div className="space-y-4">
      {/* Contas órfãs — movimentos sem conta criada */}
      {orphanAccounts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            Existem {orphanAccounts.length} conta{orphanAccounts.length > 1 ? 's' : ''} referenciada{orphanAccounts.length > 1 ? 's' : ''} nos movimentos sem conta criada:
          </p>
          <div className="flex flex-wrap gap-2">
            {orphanAccounts.map((name, i) => {
              const mvCount = movements.filter(m => m.account === name || m.accountTo === name).length
              const bal = calcBalance(name, movements)
              return (
                <button key={name} onClick={() => addOrphan(name, 'cash', ACCOUNT_COLORS[i % ACCOUNT_COLORS.length])}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm hover:bg-amber-100 transition">
                  <Plus className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-medium text-gray-800">{name}</span>
                  <span className="text-xs text-gray-500">({mvCount} mov · {fmt(bal)})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        {accounts.length > 0 && (
          <button onClick={recalcAll}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">
            <ArrowLeftRight className="w-4 h-4" /> Recalcular saldos
          </button>
        )}
        <div className={accounts.length === 0 ? 'ml-auto' : ''}>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
            <Plus className="w-4 h-4" /> Nova Conta
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Nova Conta</h3>
            <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input type="text" placeholder="Ex: Caixa Loja, BFA, Multicaixa" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              {form.name.trim() && (() => {
                const preview = movements.filter(m => m.account === form.name.trim() || m.accountTo === form.name.trim()).length
                return preview > 0 ? (
                  <p className="text-xs text-green-600 mt-1">{preview} movimentos serão ligados automaticamente</p>
                ) : null
              })()}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'cash' | 'bank' | 'mobile' }))}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="cash">Caixa</option>
                <option value="bank">Banco</option>
                <option value="mobile">Mobile Money</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
              <div className="flex gap-2 mt-1.5">
                {ACCOUNT_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={add} className="flex-1 py-2.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">Criar Conta</button>
            <button onClick={() => setShowForm(false)} className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma conta criada</p>
          <p className="text-gray-400 text-sm mt-1">Crie contas para ver os saldos calculados automaticamente pelos movimentos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => {
            const Icon = AccountIcon[acc.type] || Banknote
            const accMovements = movements.filter(m => m.account === acc.name || m.accountTo === acc.name)
            const mvCount = accMovements.length
            const isExpanded = expandedId === acc.id
            return (
              <div key={acc.id} className={`bg-white rounded-xl border shadow-sm transition-all ${isExpanded ? 'border-cyan-300 col-span-1 md:col-span-2 lg:col-span-3' : 'border-gray-200'}`}>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : acc.id)}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: acc.color + '20' }}>
                        <Icon className="w-5 h-5" style={{ color: acc.color }} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{acc.name}</p>
                        <p className="text-xs text-gray-400">{accountLabels[acc.type]} · {mvCount} movimento{mvCount !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setExpandedId(isExpanded ? null : acc.id)}
                        className="text-gray-400 hover:text-cyan-600 transition p-1">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button onClick={() => remove(acc)} className="text-gray-300 hover:text-red-500 transition p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-xs text-gray-400 mb-0.5">Saldo atual</p>
                    <p className="text-xl font-bold" style={{ color: acc.balance >= 0 ? acc.color : '#ef4444' }}>{fmt(acc.balance)}</p>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-600">Movimentos desta conta</p>
                      <span className="text-xs text-gray-400">{mvCount} registo{mvCount !== 1 ? 's' : ''}</span>
                    </div>
                    {mvCount === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Nenhum movimento associado a esta conta</p>
                    ) : (
                      <div className="divide-y divide-gray-100 max-h-[28rem] overflow-y-auto">
                        {accMovements.slice(0, 50).map(mv => {
                          const isTransferOut = mv.type === 'transfer' && mv.account === acc.name
                          const isTransferIn  = mv.type === 'transfer' && mv.accountTo === acc.name
                          const isEditing = editingMvId === mv.id

                          if (isEditing) return (
                            <div key={mv.id} className="px-5 py-4 bg-cyan-50/50 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-700">Editar movimento</p>
                                <button onClick={() => setEditingMvId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Descrição</label>
                                  <input type="text" value={editMvForm.description} onChange={e => setEditMvForm(f => ({ ...f, description: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 border rounded-lg text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Valor (AOA)</label>
                                  <input type="number" value={editMvForm.amount} onChange={e => setEditMvForm(f => ({ ...f, amount: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 border rounded-lg text-sm" min="0" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">{mv.type === 'transfer' ? 'Conta Origem' : 'Conta'}</label>
                                  <select value={editMvForm.account} onChange={e => setEditMvForm(f => ({ ...f, account: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 border rounded-lg text-sm">
                                    {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                  </select>
                                </div>
                                {mv.type === 'transfer' ? (
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">Conta Destino</label>
                                    <select value={editMvForm.accountTo} onChange={e => setEditMvForm(f => ({ ...f, accountTo: e.target.value }))}
                                      className="w-full px-2.5 py-1.5 border rounded-lg text-sm">
                                      {accounts.filter(a => a.name !== editMvForm.account).map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                    </select>
                                  </div>
                                ) : (
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">Categoria</label>
                                    <select value={editMvForm.category} onChange={e => setEditMvForm(f => ({ ...f, category: e.target.value }))}
                                      className="w-full px-2.5 py-1.5 border rounded-lg text-sm">
                                      <option value="">Sem categoria</option>
                                      {categories.filter(c => c.type === (mv.type === 'income' ? 'income' : 'expense')).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => saveEditMv(mv)}
                                  className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-medium hover:bg-cyan-700 flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Guardar
                                </button>
                                <button onClick={() => setEditingMvId(null)}
                                  className="px-4 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">Cancelar</button>
                              </div>
                            </div>
                          )

                          return (
                            <div key={mv.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 group">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                mv.type === 'income' ? 'bg-green-50' : mv.type === 'expense' ? 'bg-red-50' : 'bg-blue-50'
                              }`}>
                                {mv.type === 'income'  && <TrendingUp className="w-4 h-4 text-green-600" />}
                                {mv.type === 'expense' && <TrendingDown className="w-4 h-4 text-red-600" />}
                                {mv.type === 'transfer' && <ArrowLeftRight className="w-4 h-4 text-blue-600" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800 truncate">{mv.description}</p>
                                <p className="text-xs text-gray-400">{mv.date} · {mv.category}
                                  {isTransferOut && ` → ${mv.accountTo}`}
                                  {isTransferIn && ` ← ${mv.account}`}
                                </p>
                              </div>
                              <p className={`text-sm font-semibold whitespace-nowrap ${
                                mv.type === 'income' || isTransferIn ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {mv.type === 'income' || isTransferIn ? '+' : '-'}{fmt(mv.amount)}
                              </p>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                                <button onClick={() => startEditMv(mv)} title="Editar"
                                  className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {accounts.length > 1 && mv.type !== 'transfer' && (
                                  <select
                                    value=""
                                    onChange={e => { if (e.target.value) moveToAccount(mv, e.target.value) }}
                                    title="Mover para outra conta"
                                    className="w-7 h-7 p-0 text-gray-400 hover:text-blue-600 bg-transparent border-0 cursor-pointer appearance-none text-center"
                                    style={{ backgroundImage: 'none' }}
                                  >
                                    <option value="" disabled>↹</option>
                                    {accounts.filter(a => a.name !== mv.account).map(a => (
                                      <option key={a.id} value={a.name}>→ {a.name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        {mvCount > 50 && (
                          <p className="text-xs text-gray-400 text-center py-3">A mostrar os primeiros 50 de {mvCount} movimentos</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
