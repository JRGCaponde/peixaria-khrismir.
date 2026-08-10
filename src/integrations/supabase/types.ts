// Gerado automaticamente pelo Supabase MCP — não editar manualmente
// Para actualizar: usar o MCP tool generate_typescript_types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cash_flow: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          id: string
          order_number: string | null
          payment_type: string | null
          store_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description: string
          id?: string
          order_number?: string | null
          payment_type?: string | null
          store_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          id?: string
          order_number?: string | null
          payment_type?: string | null
          store_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          store_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          store_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          phone: string | null
          primavera_code: string | null
          store_id: string
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          primavera_code?: string | null
          store_id: string
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          primavera_code?: string | null
          store_id?: string
          tax_id?: string | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          primavera_id: string
          product_code: string | null
          quantity: number | null
          sale_id: string
          total: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          primavera_id: string
          product_code?: string | null
          quantity?: number | null
          sale_id: string
          total?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          primavera_id?: string
          product_code?: string | null
          quantity?: number | null
          sale_id?: string
          total?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          client_code: string | null
          client_name: string | null
          client_nif: string | null
          created_at: string | null
          doc_number: number
          doc_series: string | null
          doc_type: string
          id: string
          primavera_id: string
          sale_date: string
          store_id: string
          total: number | null
          total_net: number | null
          total_vat: number | null
        }
        Insert: {
          client_code?: string | null
          client_name?: string | null
          client_nif?: string | null
          created_at?: string | null
          doc_number: number
          doc_series?: string | null
          doc_type: string
          id?: string
          primavera_id: string
          sale_date: string
          store_id: string
          total?: number | null
          total_net?: number | null
          total_vat?: number | null
        }
        Update: {
          client_code?: string | null
          client_name?: string | null
          client_nif?: string | null
          created_at?: string | null
          doc_number?: number
          doc_series?: string | null
          doc_type?: string
          id?: string
          primavera_id?: string
          sale_date?: string
          store_id?: string
          total?: number | null
          total_net?: number | null
          total_vat?: number | null
        }
        Relationships: []
      }
      stock_entries: {
        Row: {
          created_at: string | null
          doc_reference: string | null
          doc_type: string | null
          entry_date: string
          id: string
          primavera_id: string | null
          product_code: string
          product_name: string | null
          quantity: number | null
          store_id: string
          supplier_code: string | null
          supplier_name: string | null
          total_cost: number | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string | null
          doc_reference?: string | null
          doc_type?: string | null
          entry_date: string
          id?: string
          primavera_id?: string | null
          product_code: string
          product_name?: string | null
          quantity?: number | null
          store_id: string
          supplier_code?: string | null
          supplier_name?: string | null
          total_cost?: number | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string | null
          doc_reference?: string | null
          doc_type?: string | null
          entry_date?: string
          id?: string
          primavera_id?: string | null
          product_code?: string
          product_name?: string | null
          quantity?: number | null
          store_id?: string
          supplier_code?: string | null
          supplier_name?: string | null
          total_cost?: number | null
          unit_cost?: number | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          customer_nif: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_fee: number | null
          delivery_type: string
          delivery_zone: string | null
          discount_amount: number | null
          discount_code: string | null
          id: string
          notes: string | null
          order_number: string
          payment_type: string
          status: string
          store_id: string | null
          subtotal: number | null
          total: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_nif?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          delivery_type?: string
          delivery_zone?: string | null
          discount_amount?: number | null
          discount_code?: string | null
          id?: string
          notes?: string | null
          order_number: string
          payment_type?: string
          status?: string
          store_id?: string | null
          subtotal?: number | null
          total: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_nif?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          delivery_type?: string
          delivery_zone?: string | null
          discount_amount?: number | null
          discount_code?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_type?: string
          status?: string
          store_id?: string | null
          subtotal?: number | null
          total?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          allow_clean: boolean | null
          allow_fillet: boolean | null
          allow_steak: boolean | null
          allow_whole: boolean | null
          category_id: string | null
          cost_price: number | null
          created_at: string | null
          expiry_date: string | null
          id: string
          image_url: string | null
          min_stock: number
          name: string
          price: number
          stock_quantity: number
          store_id: string | null
          unit: string
        }
        Insert: {
          allow_clean?: boolean | null
          allow_fillet?: boolean | null
          allow_steak?: boolean | null
          allow_whole?: boolean | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name: string
          price: number
          stock_quantity?: number
          store_id?: string | null
          unit?: string
        }
        Update: {
          allow_clean?: boolean | null
          allow_fillet?: boolean | null
          allow_steak?: boolean | null
          allow_whole?: boolean | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name?: string
          price?: number
          stock_quantity?: number
          store_id?: string | null
          unit?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      get_my_store_id: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
      reset_all_data: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
