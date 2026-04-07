// Database Types for Peixaria Khrismir
export type UserRole = 'admin' | 'employee' | 'client'

export interface User {
  id: string
  email: string
  full_name: string
  phone?: string
  address?: string
  company_name?: string
  tax_id?: string // NIF
  role: UserRole
  access_areas?: string[] // permissões do funcionário
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
  price: number // por kg
  unit: string
  stock_quantity: number
  min_stock: number
  allow_whole: boolean
  allow_clean: boolean
  allow_fillet: boolean
  allow_steak: boolean
  category_id: string
  image_url?: string
  created_at?: string
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
  quantity: number // peso em kg
  unit_price: number
  preparation: PreparationType
  total_price: number
}

export interface Order {
  id: string
  order_number: string
  customer_id?: string
  customer_name?: string
  customer_nif?: string
  status: OrderStatus
  payment_type: PaymentType
  delivery_type: DeliveryType
  total: number
  items: OrderItem[]
  created_at: string
  updated_at?: string
}

export interface StockMovement {
  id: string
  product_id: string
  quantity: number
  movement_type: 'entrada' | 'saída'
  reason: string
  created_at: string
}

export interface StoreSettings {
  store_name: string
  phone: string
  whatsapp: string
  email: string
  address: string
  nif: string
  logo_url?: string
}

export interface CartItem extends Product {
  quantity: number
  preparation: PreparationType
}

export interface CashFlow {
  id: string
  type: 'entrada' | 'saída'
  amount: number
  description: string
  order_number?: string
  payment_type?: PaymentType
  paymentType?: string
  orderId?: string
  date?: string
  created_at?: string
}
