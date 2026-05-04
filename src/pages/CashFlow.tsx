import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Tag, FileText, Plus, Trash2,
  DollarSign, ArrowLeftRight, Search, Download, LayoutDashboard,
  Banknote, Smartphone, Building2, X, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'
import { migrateExistingData, syncAllData } from '../lib/cashflow'
import { TurnoTab } from './_TurnoTab'
import { pullAll } from '../lib/sync'
import { isSupabaseReady } from '../lib/supabase'

// ── Types ──────────────────────────────────────────────────────
export interface CashMovement {
  id: string
  date: string
  type: 'income' | 'expense' | 'transfer'
  description: string
  amount: number
  category: string
  account: string
  accountTo?: string
  reference?: string
  created_at: string
}

interface Account {
  id: string
  name: string
  balance: number
  type: 'cash' | 'bank' | 'mobile'
  color: string
}

interface Category {
  id: string
  name: string
  type: 'income' | 'expense'
  color: string
}

// ── Defaults ───────────────────────────────────────────────────
const DEFAULT_ACCOUNTS: Account[] = []
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Vendas', type: 'income', color: '#10b981' },
  { id: 'cat-2', name: 'Serviços', type: 'income', color: '#3b82f6' },
  { id: 'cat-3', name: 'Fornecedores', type: 'expense', color: '#f59e0b' },
  { id: 'cat-4', name: 'Salários', type: 'expense', color: '#ef4444' },
  { id: 'cat-5', name: 'Utilidades', type: 'expense', color: '#8b5cf6' },
  { id: 'cat-6', name: 'Outros', type: 'expense', color: '#6b7280' },
]

const ACCOUNT_COLORS = ['#06b6d4', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']
const CATEGORY_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6b7280']

function fmt(n: number) { return n.toLocaleString('pt-AO') + ' AOA' }

function ls<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

// ── Main Component ─────────────────────────────────────────────
export default function CashFlow() {
  const [tab, setTab] = useState<'turno' | 'dashboard' | 'movements' | 'accounts' | 'categories' | 'reports'>('turno')

  const [accounts, setAccounts]     = useState<Account[]>(() => ls('cf_accounts', DEFAULT_ACCOUNTS))
  const [categories, setCategories] = useState<Category[]>(() => ls('cf_categories', DEFAULT_CATEGORIES))
  const [movements, setMovements]   = useState<CashMovement[]>(() => ls('cf_movements', []))

  // Sincroniza todos os pedidos e compras na abertura da página
  useEffect(() => {
    migrateExistingData()
    syncAllData()
    const synced: CashMovement[] = ls('cf_movements', [])
    setMovements(synced)
    // Puxa dados do Supabase (encomendas, compras, caixa) para ter histórico completo cross-device
    if (isSupabaseReady()) {
      pullAll().then(() => {
        syncAllData()
        setMovements(ls('cf_movements', []))
      })
    }
  }, [])

  useEffect(() => { localStorage.setItem('cf_accounts', JSON.stringify(accounts)) }, [accounts])
  useEffect(() => { localStorage.setItem('cf_categories', JSON.stringify(categories)) }, [categories])
  useEffect(() => { localStorage.setItem('cf_movements', JSON.stringify(movements)) }, [movements])

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts])

  const today = format(new Date(), 'yyyy-MM-dd')
  const todayIncome  = useMemo(() => movements.filter(m => m.date === today && m.type === 'income').reduce((s, m) => s + m.amount, 0), [movements, today])
  const todayExpense = useMemo(() => movements.filter(m => m.date === today && m.type === 'expense').reduce((s, m) => s + m.amount, 0), [movements, today])

  const thisMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const thisMonthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const monthIncome  = useMemo(() => movements.filter(m => m.date >= thisMonthStart && m.date <= thisMonthEnd && m.type === 'income').reduce((s, m) => s + m.amount, 0), [movements, thisMonthStart, thisMonthEnd])
  const monthExpense = useMemo(() => movements.filter(m => m.date >= thisMonthStart && m.date <= thisMonthEnd && m.type === 'expense').reduce((s, m) => s + m.amount, 0), [movements, thisMonthStart, thisMonthEnd])

  // ── 7-day chart data ─────────────────────────────────────────
  const chartData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')
      const label = format(subDays(new Date(), 6 - i), 'dd/MM')
      const income  = movements.filter(m => m.date === d && m.type === 'income').reduce((s, m) => s + m.amount, 0)
      const expense = movements.filter(m => m.date === d && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
      return { label, income, expense }
    })
  }, [movements])

  // ── Category pie data ────────────────────────────────────────
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    movements.filter(m => m.date >= thisMonthStart && m.date <= thisMonthEnd && m.type === 'expense').forEach(m => {
      map[m.category] = (map[m.category] || 0) + m.amount
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [movements, thisMonthStart, thisMonthEnd])

  const tabs = [
    { id: 'turno',      label: 'Turno',        Icon: Clock },
    { id: 'dashboard',  label: 'Dashboard',    Icon: LayoutDashboard },
    { id: 'movements',  label: 'Movimentos',   Icon: DollarSign },
    { id: 'accounts',   label: 'Contas',       Icon: Wallet },
    { id: 'categories', label: 'Categorias',   Icon: Tag },
    { id: 'reports',    label: 'Relatórios',   Icon: FileText },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Fluxo de Caixa</h2>
        <p className="text-gray-500 text-sm">Gestão financeira completa</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-0">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition -mb-px ${
              tab === id ? 'border-cyan-600 text-cyan-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'turno'      && <TurnoTab movements={movements} />}
      {tab === 'dashboard'  && <Dashboard totalBalance={totalBalance} todayIncome={todayIncome} todayExpense={todayExpense} monthIncome={monthIncome} monthExpense={monthExpense} accounts={accounts} movements={movements} chartData={chartData} expenseByCategory={expenseByCategory} />}
      {tab === 'movements'  && <Movements movements={movements} setMovements={setMovements} accounts={accounts} setAccounts={setAccounts} categories={categories} />}
      {tab === 'accounts'   && <AccountsTab accounts={accounts} setAccounts={setAccounts} movements={movements} />}
      {tab === 'categories' && <CategoriesTab categories={categories} setCategories={setCategories} movements={movements} />}
      {tab === 'reports'    && <Reports movements={movements} categories={categories} accounts={accounts} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
function Dashboard({ totalBalance, todayIncome, todayExpense, monthIncome, monthExpense, accounts, movements, chartData, expenseByCategory }: {
  totalBalance: number; todayIncome: number; todayExpense: number
  monthIncome: number; monthExpense: number
  accounts: Account[]; movements: CashMovement[]
  chartData: { label: string; income: number; expense: number }[]
  expenseByCategory: { name: string; value: number }[]
}) {
  const PIE_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#10b981', '#06b6d4', '#ec4899']

  const accountIcons: Record<string, typeof Banknote> = { cash: Banknote, bank: Building2, mobile: Smartphone }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Saldo Total', value: totalBalance, color: 'from-cyan-500 to-cyan-600', Icon: Wallet },
          { label: 'Entradas Hoje', value: todayIncome, color: 'from-green-500 to-green-600', Icon: TrendingUp },
          { label: 'Saídas Hoje', value: todayExpense, color: 'from-red-500 to-red-600', Icon: TrendingDown },
          { label: 'Resultado Mês', value: monthIncome - monthExpense, color: monthIncome >= monthExpense ? 'from-blue-500 to-blue-600' : 'from-orange-500 to-orange-600', Icon: BarChart as any },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className={`bg-gradient-to-br ${color} text-white rounded-xl p-5 shadow-md`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium opacity-80">{label}</p>
              <Icon className="w-5 h-5 opacity-70" />
            </div>
            <p className="text-xl font-bold">{fmt(value)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Entradas vs Saídas — últimos 7 dias</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Legend />
              <Bar dataKey="income" name="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Accounts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Contas</h3>
          {accounts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma conta criada</p>
          ) : (
            <div className="space-y-3">
              {accounts.map(acc => {
                const Icon = accountIcons[acc.type] || Banknote
                return (
                  <div key={acc.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: acc.color + '20' }}>
                      <Icon className="w-4 h-4" style={{ color: acc.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{acc.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{acc.type === 'cash' ? 'Caixa' : acc.type === 'bank' ? 'Banco' : 'Mobile'}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{fmt(acc.balance)}</p>
                  </div>
                )
              })}
              <div className="border-t pt-3 flex justify-between text-sm font-semibold">
                <span className="text-gray-600">Total</span>
                <span className="text-cyan-600">{fmt(accounts.reduce((s, a) => s + a.balance, 0))}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie chart - expense by category */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Despesas por Categoria (mês)</h3>
          {expenseByCategory.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Sem despesas este mês</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={expenseByCategory} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value">
                    {expenseByCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {expenseByCategory.slice(0, 4).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="flex-1 truncate text-gray-600">{item.name}</span>
                    <span className="font-medium">{fmt(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Month summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Resumo do Mês</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Entradas</span>
                <span className="font-medium text-green-600">{fmt(monthIncome)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full">
                <div className="h-2 bg-green-500 rounded-full" style={{ width: monthIncome + monthExpense > 0 ? `${(monthIncome / (monthIncome + monthExpense)) * 100}%` : '0%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Saídas</span>
                <span className="font-medium text-red-600">{fmt(monthExpense)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full">
                <div className="h-2 bg-red-500 rounded-full" style={{ width: monthIncome + monthExpense > 0 ? `${(monthExpense / (monthIncome + monthExpense)) * 100}%` : '0%' }} />
              </div>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between text-sm font-semibold">
                <span>Resultado</span>
                <span className={monthIncome >= monthExpense ? 'text-green-600' : 'text-red-600'}>{fmt(monthIncome - monthExpense)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent movements */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Últimos Movimentos</h3>
          {movements.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum movimento</p>
          ) : (
            <div className="space-y-3">
              {movements.slice(0, 6).map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    m.type === 'income' ? 'bg-green-100' : m.type === 'expense' ? 'bg-red-100' : 'bg-blue-100'
                  }`}>
                    {m.type === 'income' ? <TrendingUp className="w-3.5 h-3.5 text-green-600" /> : m.type === 'expense' ? <TrendingDown className="w-3.5 h-3.5 text-red-600" /> : <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{m.description}</p>
                    <p className="text-xs text-gray-400">{m.date}</p>
                  </div>
                  <p className={`text-xs font-semibold ${m.type === 'income' ? 'text-green-600' : m.type === 'expense' ? 'text-red-600' : 'text-blue-600'}`}>
                    {m.type === 'income' ? '+' : m.type === 'expense' ? '-' : ''}{m.amount.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MOVEMENTS
// ══════════════════════════════════════════════════════════════
function Movements({ movements, setMovements, accounts, setAccounts, categories }: {
  movements: CashMovement[]; setMovements: React.Dispatch<React.SetStateAction<CashMovement[]>>
  accounts: Account[]; setAccounts: React.Dispatch<React.SetStateAction<Account[]>>
  categories: Category[]
}) {
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
              placeholder="Pesquisar..." className="pl-9 pr-4 py-2 border rounded-lg text-sm w-48" />
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
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any, category: '' }))}
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
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{visible.length} movimento{visible.length !== 1 ? 's' : ''}</span>
        </div>
        {visible.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">Nenhum movimento encontrado</div>
        ) : (
          <div className="divide-y">
            {visible.map(m => (
              <div key={m.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  m.type === 'income' ? 'bg-green-100' : m.type === 'expense' ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                  {m.type === 'income' ? <TrendingUp className="w-4 h-4 text-green-600" /> : m.type === 'expense' ? <TrendingDown className="w-4 h-4 text-red-600" /> : <ArrowLeftRight className="w-4 h-4 text-blue-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.description}</p>
                  <p className="text-xs text-gray-400">
                    {m.date} · {m.account}{m.accountTo ? ` → ${m.accountTo}` : ''}{m.category ? ` · ${m.category}` : ''}{m.reference ? ` · Ref: ${m.reference}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-bold flex-shrink-0 ${m.type === 'income' ? 'text-green-600' : m.type === 'expense' ? 'text-red-600' : 'text-blue-600'}`}>
                  {m.type === 'income' ? '+' : m.type === 'expense' ? '-' : ''}{fmt(m.amount)}
                </p>
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

// ══════════════════════════════════════════════════════════════
// ACCOUNTS
// ══════════════════════════════════════════════════════════════
function AccountsTab({ accounts, setAccounts, movements }: {
  accounts: Account[]; setAccounts: React.Dispatch<React.SetStateAction<Account[]>>; movements: CashMovement[]
}) {
  const [form, setForm] = useState({ name: '', type: 'cash' as 'cash' | 'bank' | 'mobile', balance: '', color: ACCOUNT_COLORS[0] })
  const [showForm, setShowForm] = useState(false)

  const add = () => {
    if (!form.name.trim()) { toast.error('Digite o nome da conta'); return }
    if (accounts.find(a => a.name.toLowerCase() === form.name.toLowerCase())) { toast.error('Já existe uma conta com esse nome'); return }
    setAccounts(prev => [...prev, {
      id: Date.now().toString(),
      name: form.name.trim(),
      type: form.type,
      balance: parseFloat(form.balance) || 0,
      color: form.color,
    }])
    setForm({ name: '', type: 'cash', balance: '', color: ACCOUNT_COLORS[0] })
    setShowForm(false)
    toast.success('Conta criada!')
  }

  const remove = (acc: Account) => {
    const inUse = movements.some(m => m.account === acc.name || m.accountTo === acc.name)
    if (inUse) { toast.error('Não é possível eliminar uma conta com movimentos associados'); return }
    if (!confirm(`Eliminar a conta "${acc.name}"?`)) return
    setAccounts(prev => prev.filter(a => a.id !== acc.id))
    toast.success('Conta eliminada')
  }

  const accountLabels: Record<string, string> = { cash: 'Caixa', bank: 'Banco', mobile: 'Mobile Money' }
  const AccountIcon: Record<string, typeof Banknote> = { cash: Banknote, bank: Building2, mobile: Smartphone }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
          <Plus className="w-4 h-4" /> Nova Conta
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Nova Conta</h3>
            <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input type="text" placeholder="Ex: Caixa Loja, BFA, Multicaixa" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="cash">Caixa</option>
                <option value="bank">Banco</option>
                <option value="mobile">Mobile Money</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Saldo Inicial (AOA)</label>
              <input type="number" placeholder="0" value={form.balance}
                onChange={e => setForm(f => ({ ...f, balance: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" min="0" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
            <div className="flex gap-2">
              {ACCOUNT_COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-7 h-7 rounded-full border-2 transition ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
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
          <p className="text-gray-400 text-sm mt-1">Crie contas de caixa, banco ou mobile money</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => {
            const Icon = AccountIcon[acc.type] || Banknote
            const mvCount = movements.filter(m => m.account === acc.name || m.accountTo === acc.name).length
            return (
              <div key={acc.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: acc.color + '20' }}>
                      <Icon className="w-5 h-5" style={{ color: acc.color }} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{acc.name}</p>
                      <p className="text-xs text-gray-400">{accountLabels[acc.type]} · {mvCount} movimento{mvCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <button onClick={() => remove(acc)} className="text-gray-300 hover:text-red-500 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-400 mb-0.5">Saldo atual</p>
                  <p className="text-xl font-bold" style={{ color: acc.balance >= 0 ? acc.color : '#ef4444' }}>{fmt(acc.balance)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════════════
function CategoriesTab({ categories, setCategories, movements }: {
  categories: Category[]; setCategories: React.Dispatch<React.SetStateAction<Category[]>>; movements: CashMovement[]
}) {
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
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
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

// ══════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════
function Reports({ movements, categories, accounts }: { movements: CashMovement[]; categories: Category[]; accounts: Account[] }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [end, setEnd]     = useState(today)
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
  const income  = filtered.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0)
  const expense = filtered.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0)
  const net     = income - expense

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
    income:  filtered.filter(m => m.account === a.name && m.type === 'income').reduce((s, m) => s + m.amount, 0),
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
                    {cat.income > 0 && <span className="text-xs text-green-600 font-medium">+{cat.income.toLocaleString()}</span>}
                    {cat.expense > 0 && <span className="text-xs text-red-600 font-medium">-{cat.expense.toLocaleString()}</span>}
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
                    <span className="text-green-600">+{a.income.toLocaleString()} AOA entradas</span>
                    <span className="text-red-600">-{a.expense.toLocaleString()} AOA saídas</span>
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
                    <td className="px-4 py-3 text-gray-600">{m.date}</td>
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
