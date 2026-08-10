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

export interface Account {
  id: string
  name: string
  balance: number
  type: 'cash' | 'bank' | 'mobile'
  color: string
}

export interface Category {
  id: string
  name: string
  type: 'income' | 'expense'
  color: string
}

// ── Defaults ───────────────────────────────────────────────────
export const DEFAULT_ACCOUNTS: Account[] = []

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Vendas', type: 'income', color: '#10b981' },
  { id: 'cat-2', name: 'Serviços', type: 'income', color: '#3b82f6' },
  { id: 'cat-3', name: 'Fornecedores', type: 'expense', color: '#f59e0b' },
  { id: 'cat-4', name: 'Salários', type: 'expense', color: '#ef4444' },
  { id: 'cat-5', name: 'Utilidades', type: 'expense', color: '#8b5cf6' },
  { id: 'cat-6', name: 'Outros', type: 'expense', color: '#6b7280' },
]

export const ACCOUNT_COLORS = ['#06b6d4', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']
export const CATEGORY_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6b7280']

export function fmt(n: number | undefined | null) {
  return (n ?? 0).toLocaleString('pt-AO') + ' AOA'
}
