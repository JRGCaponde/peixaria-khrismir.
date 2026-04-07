export interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: string;
  stock: number;
  minStock: number;
  image: string;
  allowPreparations: string[]; // ['inteiro', 'limpo', 'file', 'posta']
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  preparation?: string;
}

export interface Order {
  id: string;
  number: string;
  customerName: string;
  customerNif: string;
  items: OrderItem[];
  total: number;
  paymentType: 'Multicaixa' | 'Express' | 'Dinheiro';
  deliveryType: 'Retirada' | 'Delivery';
  status: 'Pendente' | 'Confirmado' | 'Preparando' | 'Pronto' | 'Entregue' | 'Cancelado';
  date: string;
  cashier: string;
  agtHash?: string;
  agtCertificate?: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'employee';
  accessAreas: string[]; // ['pdv', 'pedidos', 'relatorios', 'estoque', 'admin']
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'Entrada' | 'Saída';
  description: string;
  paymentType: string;
  amount: number;
  date: string;
}

export interface StoreSettings {
  name: string;
  address: string;
  locationDetails: string;
  phones: string[];
  whatsapp: string;
  nif: string;
  agtCertificate: string;
  logo: string;
}
