import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Category, CashMovement, CATEGORY_COLORS } from '../lib/types'

interface CategoriesTabProps {
  categories: Category[]
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>
  movements: CashMovement[]
}

export function CategoriesTab({ categories, setCategories, movements }: CategoriesTabProps) {
  const [form, setForm] = useState({ name: '', type: 'income' as 'income' | 'expense', color: CATEGORY_COLORS[0] })
  const [showForm, setShowForm] = useState(false)

  const add = () => {
    if (!form.name.trim()) { toast.error('Digite o nome da categoria'); return }
    if (categories.find(c => c.name.toLowerCase() === form.name.toLowerCase())) { toast.error('Já existe uma categoria com esse nome'); return }
    setCategories(prev => [...prev, { id: Date.now().toString(), name: form.name.trim(), type: form.type, color: form.color }])
    setForm({ name: '', type: 'income', color: CATEGORY_COLORS[0] })
    setShowForm(false)
    toast.success('Categoria criada!')
  }

  const remove = (cat: Category) => {
    const inUse = movements.some(m => m.category === cat.name)
    if (inUse) { toast.error('Categoria em uso — não pode ser eliminada'); return }
    if (!confirm(`Eliminar categoria "${cat.name}"?`)) return
    setCategories(prev => prev.filter(c => c.id !== cat.id))
    toast.success('Categoria eliminada')
  }

  const income = categories.filter(c => c.type === 'income')
  const expense = categories.filter(c => c.type === 'expense')

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
          <Plus className="w-4 h-4" /> Nova Categoria
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Nova Categoria</h3>
            <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input type="text" placeholder="Ex: Vendas, Salários..." value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'income' | 'expense' }))}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="income">Receita</option>
                <option value="expense">Despesa</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-7 h-7 rounded-full border-2 transition ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={add} className="flex-1 py-2.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">Criar Categoria</button>
            <button onClick={() => setShowForm(false)} className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[{ list: income, label: 'Receitas', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
          { list: expense, label: 'Despesas', color: 'text-red-700', bg: 'bg-red-50 border-red-200' }].map(({ list, label, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className={`px-5 py-3 border-b ${bg}`}>
              <h3 className={`font-semibold ${color}`}>{label} ({list.length})</h3>
            </div>
            {list.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma categoria</p>
            ) : (
              <div className="divide-y">
                {list.map(cat => {
                  const uses = movements.filter(m => m.category === cat.name).length
                  return (
                    <div key={cat.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="flex-1 text-sm font-medium text-gray-800">{cat.name}</span>
                      <span className="text-xs text-gray-400">{uses} uso{uses !== 1 ? 's' : ''}</span>
                      <button onClick={() => remove(cat)} className="text-gray-300 hover:text-red-500 transition ml-2">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
