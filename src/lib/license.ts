import { supabase, isSupabaseReady } from './supabase'

const TRIAL_DAYS = 30
const LICENSE_KEY = 'khrismir_license'
const INSTALL_DATE_KEY = 'khrismir_install_date'
const DEVICE_ID_KEY = 'khrismir_device_id'

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function getInstallDate(): Date {
  const stored = localStorage.getItem(INSTALL_DATE_KEY)
  if (!stored) {
    const now = new Date().toISOString()
    localStorage.setItem(INSTALL_DATE_KEY, now)
    return new Date(now)
  }
  return new Date(stored)
}

export function getLicenseKey(): string | null {
  return localStorage.getItem(LICENSE_KEY)
}

export function getDaysRemaining(): number {
  const installDate = getInstallDate()
  const daysDiff = Math.floor((Date.now() - installDate.getTime()) / 86400000)
  return Math.max(0, TRIAL_DAYS - daysDiff)
}

export function isLicenseValid(): boolean {
  const key = getLicenseKey()
  return !!key && validateKey(key)
}

export function isTrialActive(): boolean {
  return getDaysRemaining() > 0
}

export function isAppActive(): boolean {
  return isLicenseValid() || isTrialActive()
}

export async function activateLicense(key: string): Promise<boolean> {
  if (!validateKey(key)) return false
  localStorage.setItem(LICENSE_KEY, key.toUpperCase())
  if (isSupabaseReady() && supabase) {
    try {
      await supabase.from('licenses').upsert({
        id: getDeviceId(),
        key: key.toUpperCase(),
        activated_at: new Date().toISOString(),
        install_date: getInstallDate().toISOString(),
      }, { onConflict: 'id' })
    } catch { /* non-fatal — funciona offline */ }
  }
  return true
}

// Chamado no arranque do App: se o utilizador limpou o localStorage mas tem licença no Supabase, recupera
export async function syncLicenseFromCloud(): Promise<void> {
  if (!isSupabaseReady() || !supabase || isLicenseValid()) return
  try {
    const { data } = await supabase
      .from('licenses')
      .select('key')
      .eq('id', getDeviceId())
      .maybeSingle()
    if (data?.key && validateKey(data.key)) {
      localStorage.setItem(LICENSE_KEY, data.key)
    }
  } catch { /* non-fatal */ }
}

// Key format: KHRIS-XXXX-YYYY-ZZZZ
// ZZZZ = ((charsum de XXXX + YYYY) % 10000).padStart(4,'0')
function validateKey(key: string): boolean {
  const parts = key.toUpperCase().replace(/\s/g, '').split('-')
  if (parts.length !== 4) return false
  if (parts[0] !== 'KHRIS') return false
  const [, a, b, c] = parts
  if (!/^[A-Z0-9]{4}$/.test(a) || !/^[A-Z0-9]{4}$/.test(b) || !/^[0-9]{4}$/.test(c)) return false
  const charSum = [...(a + b)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const expected = (charSum % 10000).toString().padStart(4, '0')
  return c === expected
}

// Helper de geração de chaves (usar na consola do browser): generateLicenseKey('AAAA', 'BBBB')
export function generateLicenseKey(a: string, b: string): string {
  const charSum = [...(a.toUpperCase() + b.toUpperCase())].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const checksum = (charSum % 10000).toString().padStart(4, '0')
  return `KHRIS-${a.toUpperCase()}-${b.toUpperCase()}-${checksum}`
}
