/**
 * _TurnoTab.tsx — exporta apenas getOpenShift() usado pelo POS.
 * O TurnoTab completo está em CashFlow/src/components/TurnoTab.tsx
 */
import type { ShiftSession } from '../types/database'

function lsShifts(): ShiftSession[] {
  try { return JSON.parse(localStorage.getItem('khrismir_shifts') || '[]') } catch { return [] }
}

/** Retorna o turno aberto actualmente (sem closed_at), ou null */
export function getOpenShift(): ShiftSession | null {
  return lsShifts().find(s => !s.closed_at) || null
}
