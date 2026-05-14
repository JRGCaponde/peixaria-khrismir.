/**
 * autoBackup.ts — Backup automático a cada 30 minutos
 * Ciclo: snapshot local → push Supabase (o Realtime distribui para todos os dispositivos)
 * NOTA: O Realtime (WebSocket) sincroniza mudanças em tempo real — o autoBackup é apenas
 * um safety net para garantir consistência caso o WebSocket falhe.
 */
import { pushAll } from './sync'
import { toast } from 'sonner'

export const BACKUP_KEY      = 'khrismir_backup_auto'
export const BACKUP_META_KEY = 'khrismir_backup_auto_meta'

const INTERVAL_MS = 30 * 60 * 1000 // 30 minutos

const KHRISMIR_KEYS = [
  'khrismir_orders',
  'khrismir_products',
  'khrismir_categories',
  'khrismir_cashflow',
  'khrismir_purchases',
  'khrismir_employees',
  'khrismir_settings',
  'khrismir_promos',
  'khrismir_delivery_zones',
  'khrismir_suppliers',
  'khrismir_clients',
  'cf_movements',
  'cf_accounts',
  'cf_categories',
]

export interface BackupMeta {
  timestamp: string
  size: number
  keys: number
}

/** Guarda snapshot de todos os dados khrismir no localStorage */
export function createLocalBackup(): BackupMeta {
  const snapshot: Record<string, any> = {
    __timestamp: new Date().toISOString(),
    __version: '1.5',
  }
  let keys = 0
  for (const key of KHRISMIR_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) { snapshot[key] = JSON.parse(raw); keys++ }
    } catch { /* ignora chave corrompida */ }
  }
  const json = JSON.stringify(snapshot)
  localStorage.setItem(BACKUP_KEY, json)
  const meta: BackupMeta = { timestamp: snapshot.__timestamp, size: json.length, keys }
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta))
  return meta
}

/** Restaura o último snapshot automático para o localStorage */
export function restoreLocalBackup(): boolean {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    if (!raw) return false
    const snapshot = JSON.parse(raw)
    for (const key of KHRISMIR_KEYS) {
      if (key in snapshot) localStorage.setItem(key, JSON.stringify(snapshot[key]))
    }
    return true
  } catch { return false }
}

/** Retorna metadados do último backup automático */
export function getLastBackupMeta(): BackupMeta | null {
  try { return JSON.parse(localStorage.getItem(BACKUP_META_KEY) || 'null') }
  catch { return null }
}

let _timer: ReturnType<typeof setInterval> | null = null
let _running = false

/**
 * Executa um ciclo de backup:
 * 1. Snapshot local (createLocalBackup)
 * 2. Push para Supabase (o Realtime distribui automaticamente para todos os dispositivos)
 *
 * NOTA: Não faz pull — o Realtime (postgres_changes) já sincroniza
 * as mudanças de outros dispositivos em tempo real via WebSocket.
 */
export async function runAutoBackup(silent = true): Promise<void> {
  if (_running) return
  _running = true
  try {
    // 1. Snapshot local
    createLocalBackup()

    // 2. Push para Supabase → Realtime notifica todos os outros dispositivos
    await pushAll()
  } catch (err) {
    console.warn('[AutoBackup] Erro:', err)
    if (!silent) {
      toast.warning('⚠️ Sync falhou — verifique a ligação à internet', {
        duration: 3000,
        id: 'auto-backup-error',
      })
    }
  } finally {
    _running = false
  }
}

/** Inicia o ciclo automático de sync a cada 30 minutos */
export function startAutoBackup(): void {
  if (_timer) return // já está a correr
  console.log('[AutoBackup] Iniciado — sync a cada 30 minutos')
  // Primeiro backup imediato
  runAutoBackup(true)
  _timer = setInterval(() => runAutoBackup(true), INTERVAL_MS)
}

/** Para o ciclo automático */
export function stopAutoBackup(): void {
  if (_timer) { clearInterval(_timer); _timer = null }
}

/** Verdadeiro se o ciclo estiver activo */
export function isAutoBackupRunning(): boolean {
  return _timer !== null
}
