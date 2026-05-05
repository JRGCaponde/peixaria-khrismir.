export interface StoreSettings {
  name: string
  phone: string
  whatsapp: string
  email: string
  address: string
  nif: string
  iva_rate: number
  logo_url?: string
  delivery_enabled: boolean
  min_order_delivery: number
  opening_hours: string
  // Dados fiscais/empresa
  capital_social?: string
  cons_reg_com?: string
  // Dados bancários (para facturas)
  bank_name?: string
  bank_account?: string
  bank_iban?: string
}

export const DEFAULT_SETTINGS: StoreSettings = {
  name: 'Peixaria Khrismir',
  phone: '+244 929 970 984',
  whatsapp: '244929970984',
  email: 'khrismir@gmail.com',
  address: 'Centralidade da Quilemba, Lubango, Huíla, Angola',
  nif: '5001210092',
  iva_rate: 14,
  delivery_enabled: true,
  min_order_delivery: 0,
  opening_hours: 'Seg–Sáb: 07:00–18:00',
  capital_social: '',
  cons_reg_com: '',
  bank_name: '',
  bank_account: '',
  bank_iban: '',
}

export function getSettings(): StoreSettings {
  try {
    const stored = localStorage.getItem('khrismir_settings')
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: StoreSettings): void {
  localStorage.setItem('khrismir_settings', JSON.stringify(s))
}
