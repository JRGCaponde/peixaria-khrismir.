import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, ArrowLeftRight,
  Banknote, Smartphone, Building2,
} from 'lucide-react'
import { format } from 'date-fns'
import { Account, CashMovement, fmt } from '../lib/types'

interface DashboardProps {
  totalBalance: number
  todayIncome: number
  todayExpense: number
  monthIncome: number
  monthExpense: number
  accounts: Account[]
  movements: CashMovement[]
  chartData: { label: string; income: number; expense: number }[]
  expenseByCategory: { name: string; value: number }[]
}

const PIE_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#10b981', '#06b6d4', '#ec4899']
const accountIcons: Record<string, typeof Banknote> = { cash: Banknote, bank: Building2, mobile: Smartphone }

export function Dashboard({ 
  totalBalance, 
  todayIncome, 
  todayExpense, 
  monthIncome, 
  monthExpense, 
  accounts, 
  movements, 
  chartData, 
  expenseByCategory 
}: DashboardProps) {
  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Saldo Total', value: totalBalance, color: 'from-cyan-500 to-cyan-600', Icon: Wallet },
          { label: 'Entradas Hoje', value: todayIncome, color: 'from-green-500 to-green-600', Icon: TrendingUp },
          { label: 'Saídas Hoje', value: todayExpense, color: 'from-red-500 to-red-600', Icon: TrendingDown },
          { label: 'Resultado Mês', value: monthIncome - monthExpense, color: monthIncome >= monthExpense ? 'from-blue-500 to-blue-600' : 'from-orange-500 to-orange-600', Icon: BarChart as unknown as typeof Wallet },
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
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
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
                  <Tooltip formatter={(v) => fmt(Number(v))} />
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
                    <p className="text-xs text-gray-400">{m.created_at ? format(new Date(m.created_at), 'dd/MM/yyyy HH:mm') : m.date}</p>
                  </div>
                  <p className={`text-xs font-semibold ${m.type === 'income' ? 'text-green-600' : m.type === 'expense' ? 'text-red-600' : 'text-blue-600'}`}>
                    {m.type === 'income' ? '+' : m.type === 'expense' ? '-' : ''}{(m.amount ?? 0).toLocaleString()}
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
