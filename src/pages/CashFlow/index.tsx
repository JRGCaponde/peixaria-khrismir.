/**
 * CashFlow — ponto de entrada do módulo no app Vite.
 *
 * Os sub-componentes de cada tab estão em ./src/components/.
 * Os tipos e utilitários estão em ./src/lib/.
 * Este ficheiro trata da orquestração de estado e sincronização Supabase.
 */

import { useState, useEffect, useMemo } from 'react'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { Wallet, Tag, FileText, DollarSign, LayoutDashboard, Clock } from 'lucide-react'

import { CashMovement, Account, Category, DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './src/lib/types'
import { ls } from './src/lib/utils'
import { TurnoTab } from './src/components/TurnoTab'
import { Dashboard } from './src/components/Dashboard'
import { Movements } from './src/components/Movements'
import { AccountsTab } from './src/components/AccountsTab'
import { CategoriesTab } from './src/components/CategoriesTab'
import { Reports } from './src/components/Reports'

import { pullAll, syncCfAccounts, syncCfCategories } from '../../lib/sync'
import { isSupabaseReady } from '../../lib/supabase'
import { purgeZeroMovements } from '../../lib/cashflow'

type TabId = 'turno' | 'dashboard' | 'movements' | 'accounts' | 'categories' | 'reports'

export default function CashFlow() {
  const [tab, setTab] = useState<TabId>('turno')

  const [accounts, setAccounts]     = useState<Account[]>(() => ls('cf_accounts', DEFAULT_ACCOUNTS))
  const [categories, setCategories] = useState<Category[]>(() => ls('cf_categories', DEFAULT_CATEGORIES))
  const [movements, setMovements]   = useState<CashMovement[]>(() => ls('cf_movements', []))

  // Flag: só sincroniza para o Supabase APÓS o carregamento inicial (evita loop Realtime)
  const [syncReady, setSyncReady] = useState(false)

  // Carregamento inicial + Realtime
  useEffect(() => {
    const loadAll = () => {
      setAccounts(ls('cf_accounts', DEFAULT_ACCOUNTS))
      setCategories(ls('cf_categories', DEFAULT_CATEGORIES))
      setMovements(ls('cf_movements', []))
    }

    // Limpa movimentos com valor 0 antes de carregar
    purgeZeroMovements()

    if (isSupabaseReady()) {
      pullAll().then(() => { loadAll(); setSyncReady(true) })
    } else {
      loadAll()
      setSyncReady(true)
    }

    const handleSync = (e: Event) => {
      const table = (e as CustomEvent).detail?.table
      if (!table || table === 'pullAll' || ['cf_accounts', 'cf_categories', 'cf_movements'].includes(table)) {
        // Desactiva sync temporariamente para evitar loop Realtime → sync → Realtime
        setSyncReady(false)
        loadAll()
        setTimeout(() => setSyncReady(true), 1000)
      }
    }
    window.addEventListener('khrismir:sync', handleSync)
    return () => window.removeEventListener('khrismir:sync', handleSync)
  }, [])

  // Persiste no localStorage; sincroniza contas e categorias (arrays pequenos, seguro)
  // NÃO sincroniza movimentos em bulk — demasiado grande e causa loop Realtime
  useEffect(() => {
    localStorage.setItem('cf_accounts', JSON.stringify(accounts))
    if (syncReady && isSupabaseReady() && accounts.length > 0) syncCfAccounts(accounts)
  }, [accounts, syncReady])

  useEffect(() => {
    localStorage.setItem('cf_categories', JSON.stringify(categories))
    if (syncReady && isSupabaseReady() && categories.length > 0) syncCfCategories(categories)
  }, [categories, syncReady])

  // Movimentos: só persiste localmente.
  // A sincronização individual é feita em Movements.tsx quando o utilizador cria/edita/apaga.
  useEffect(() => {
    localStorage.setItem('cf_movements', JSON.stringify(movements))
  }, [movements])

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts])

  const today = format(new Date(), 'yyyy-MM-dd')
  const todayIncome  = useMemo(() => movements.filter(m => m.date === today && m.type === 'income').reduce((s, m) => s + m.amount, 0), [movements, today])
  const todayExpense = useMemo(() => movements.filter(m => m.date === today && m.type === 'expense').reduce((s, m) => s + m.amount, 0), [movements, today])

  const thisMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const thisMonthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const monthIncome  = useMemo(() => movements.filter(m => m.date >= thisMonthStart && m.date <= thisMonthEnd && m.type === 'income').reduce((s, m) => s + m.amount, 0), [movements, thisMonthStart, thisMonthEnd])
  const monthExpense = useMemo(() => movements.filter(m => m.date >= thisMonthStart && m.date <= thisMonthEnd && m.type === 'expense').reduce((s, m) => s + m.amount, 0), [movements, thisMonthStart, thisMonthEnd])

  const chartData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d     = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')
    const label = format(subDays(new Date(), 6 - i), 'dd/MM')
    const income  = movements.filter(m => m.date === d && m.type === 'income').reduce((s, m) => s + m.amount, 0)
    const expense = movements.filter(m => m.date === d && m.type === 'expense').reduce((s, m) => s + m.amount, 0)
    return { label, income, expense }
  }), [movements])

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    movements.filter(m => m.date >= thisMonthStart && m.date <= thisMonthEnd && m.type === 'expense').forEach(m => {
      map[m.category] = (map[m.category] || 0) + m.amount
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [movements, thisMonthStart, thisMonthEnd])

  const tabs = [
    { id: 'turno'      as const, label: 'Turno',      Icon: Clock },
    { id: 'dashboard'  as const, label: 'Dashboard',  Icon: LayoutDashboard },
    { id: 'movements'  as const, label: 'Movimentos', Icon: DollarSign },
    { id: 'accounts'   as const, label: 'Contas',     Icon: Wallet },
    { id: 'categories' as const, label: 'Categorias', Icon: Tag },
    { id: 'reports'    as const, label: 'Relatórios', Icon: FileText },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Fluxo de Caixa</h2>
        <p className="text-gray-500 text-sm">Gestão financeira completa</p>
      </div>

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
      {tab === 'dashboard'  && (
        <Dashboard
          totalBalance={totalBalance}
          todayIncome={todayIncome}
          todayExpense={todayExpense}
          monthIncome={monthIncome}
          monthExpense={monthExpense}
          accounts={accounts}
          movements={movements}
          chartData={chartData}
          expenseByCategory={expenseByCategory}
        />
      )}
      {tab === 'movements'  && (
        <Movements
          movements={movements}
          setMovements={setMovements}
          accounts={accounts}
          setAccounts={setAccounts}
          categories={categories}
        />
      )}
      {tab === 'accounts'   && (
        <AccountsTab
          accounts={accounts}
          setAccounts={setAccounts}
          movements={movements}
          setMovements={setMovements}
          categories={categories}
        />
      )}
      {tab === 'categories' && (
        <CategoriesTab
          categories={categories}
          setCategories={setCategories}
          movements={movements}
        />
      )}
      {tab === 'reports'    && (
        <Reports
          movements={movements}
          categories={categories}
          accounts={accounts}
        />
      )}
    </div>
  )
}
