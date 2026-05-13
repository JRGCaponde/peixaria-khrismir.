import { CashMovement } from './types'

/** Calcula o saldo de uma conta com base nos movimentos */
export function calcBalance(accountName: string, movements: CashMovement[]): number {
  let balance = 0
  for (const m of movements) {
    if (m.account === accountName) {
      if (m.type === 'income') balance += m.amount
      else if (m.type === 'expense') balance -= m.amount
      else if (m.type === 'transfer') balance -= m.amount
    }
    if (m.type === 'transfer' && m.accountTo === accountName) {
      balance += m.amount
    }
  }
  return balance
}

/** Local storage helper */
export function ls<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { 
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback 
  } catch { 
    return fallback 
  }
}
