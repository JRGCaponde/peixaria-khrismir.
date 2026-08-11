// Database Types for Peixaria Khrismir
export type UserRole = 'admin' | 'employee' | 'gerente' | 'client'

export interface User {
  id: string
  email: string
  full_name: string
  phone?: string
  address?: string
  company_name?: string
  tax_id?: string
  role: UserRole
  access_areas?: string[]   // tabs do admin acessíveis pelo gerente
  created_at?: string
}

export interface Employee extends User {
  password: string
}

export interface Category {
  id: string
  name: string
  description?: string
  image_url?: string
}

export interface Product {
  id: string
  name: string
  price: number
  cost_price?: number
  unit: string
  stock_quantity: number
  min_stock: number
  allow_whole: boolean
  allow_clean: boolean
  allow_fillet: boolean
  allow_steak: boolean
  category_id: string
  image_url?: string
  expiry_date?: string
  discount?: number       // desconto em % (0-100)
  created_at?: string
}

export interface Supplier {
  id: string
  name: string
  nif?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  created_at: string
}

export interface ShiftSession {
  id: string
  opened_at: string
  closed_at?: string
  opening_balance: number
  closing_balance?: number
  cash_counted?: number
  difference?: number
  opened_by: string
  opened_by_id?: string
  closed_by?: string
  notes?: string
}

export interface Return {
  id: string
  order_id: string
  order_number: string
  customer_name?: string
  items: { product_name: string; quantity: number; amount: number }[]
  total: number
  reason: string
  created_at: string
}

export interface LoyaltyTransaction {
  id: string
  client_id: string
  client_name: string
  points: number
  type: 'earned' | 'redeemed'
  order_id?: string
  created_at: string
}

export type OrderStatus = 'pendente' | 'confirmado' | 'preparando' | 'pronto' | 'entregue' | 'cancelado'
export type PaymentType = 'multicaixa' | 'express' | 'dinheiro' | 'misto'

export interface PaymentSplitEntry {
  method: 'multicaixa' | 'express' | 'dinheiro'
  amount: number
}
export type DeliveryType = 'retirada' | 'delivery'
export type PreparationType = 'inteiro' | 'limpo' | 'filé' | 'posta'

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  preparation: PreparationType
  total_price: number
}

export interface Order {
  id: string
  order_number: string
  customer_id?: string
  customer_name?: string
  customer_phone?: string
  customer_nif?: string
  status: OrderStatus
  payment_type: PaymentType
  delivery_type: DeliveryType
  delivery_zone?: string
  delivery_fee?: number
  delivery_address?: string
  delivery_lat?: number
  delivery_lng?: number
  delivery_distance_km?: number
  doc_type?: 'FA' | 'FP'
  converted_to_order_id?: string
  converted_from_order_id?: string
  payment_status?: 'pago' | 'pendente'
  paid_at?: string
  payment_split?: PaymentSplitEntry[]
  discount_code?: string
  discount_amount?: number
  subtotal?: number
  total: number
  items: OrderItem[]
  notes?: string
  created_at: string
  updated_at?: string
  hash?: string
  // Faturação Eletrónica AGT — apenas local (tal como `hash`), sem sync Supabase
  agt_status?: 'nao_aplicavel' | 'pendente' | 'enviado' | 'erro'
  agt_submission_id?: string
  agt_sent_at?: string
  agt_error?: string
}

export interface DeliveryZone {
  id: string
  name: string
  price: number
  description?: string
}

export interface MapReference {
  id: string
  name: string
  lat: number
  lng: number
}

export interface PromoCode {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_order: number
  uses: number
  max_uses?: number
  expires_at?: string
  active: boolean
  created_at: string
}

export interface StockMovement {
  id: string
  product_id: string
  quantity: number
  movement_type: 'entrada' | 'saída'
  reason: string
  created_at: string
}

export interface CartItem extends Product {
  quantity: number
  preparation: PreparationType
}

export type PurchaseType = 'fornecedor' | 'interno'

export interface PurchaseItem {
  name: string
  quantity: number
  unitPrice: number
}

export interface Purchase {
  id: string
  date: string
  type: PurchaseType
  supplier: string
  items: PurchaseItem[]
  total: number
  paymentType: string
  notes?: string
  payment_status?: 'pago' | 'pendente'
  paid_at?: string
}

export interface CashFlow {
  id: string
  type: 'entrada' | 'saida'
  amount: number
  description: string
  order_number?: string
  payment_type?: PaymentType
  created_at?: string
}

// ── Tipos PRIMAVERA ────────────────────────────────────────────────────────────

export interface Client {
  id: string
  store_id: string
  full_name: string
  company_name?: string | null
  tax_id?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  primavera_code?: string | null
  created_at?: string | null
}

export interface Sale {
  id: string
  primavera_id: string
  store_id: string
  doc_type: string
  doc_number: number
  doc_series?: string | null
  sale_date: string
  client_code?: string | null
  client_name?: string | null
  client_nif?: string | null
  total?: number | null
  total_net?: number | null
  total_vat?: number | null
  created_at?: string | null
}

export interface SaleItem {
  id: string
  primavera_id: string
  sale_id: string
  product_code?: string | null
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  total?: number | null
  created_at?: string | null
}

export interface StockEntry {
  id: string
  primavera_id?: string | null
  store_id: string
  product_code: string
  product_name?: string | null
  quantity?: number | null
  unit_cost?: number | null
  total_cost?: number | null
  doc_type?: string | null
  doc_reference?: string | null
  supplier_code?: string | null
  supplier_name?: string | null
  entry_date: string
  created_at?: string | null
}

// ── Contabilidade (PGC-AO, partidas dobradas) ──────────────────────────────

export interface AccountingAccount {
  id: string
  code: string                       // ex: "11", "71", "35"
  name: string
  class: number                      // 0-8 (classe PGC-AO)
  nature: 'devedora' | 'credora'     // natureza do saldo normal da conta
  editable: boolean                  // false para as contas semeadas por defeito
  created_at?: string
}

export interface JournalLine {
  account_code: string
  debit: number
  credit: number
}

export type JournalSource = 'manual' | 'auto_venda' | 'auto_compra' | 'auto_movimento'

export interface JournalEntry {
  id: string
  date: string
  description: string
  reference?: string
  source: JournalSource
  lines: JournalLine[]
  created_by?: string
  created_at: string
}
