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
export type PaymentType = 'multicaixa' | 'express' | 'dinheiro'
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
  discount_code?: string
  discount_amount?: number
  subtotal?: number
  total: number
  items: OrderItem[]
  notes?: string
  created_at: string
  updated_at?: string
  hash?: string
}

export interface DeliveryZone {
  id: string
  name: string
  price: number
  description?: string
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
