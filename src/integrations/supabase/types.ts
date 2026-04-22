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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      business_rules: {
        Row: {
          actions: Json
          company_id: string
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          module: string
          name: string
          priority: number
          rule_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          company_id: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          module: string
          name: string
          priority?: number
          rule_type?: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          company_id?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          module?: string
          name?: string
          priority?: number
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          business_type: string
          created_at: string
          email: string | null
          gst_inclusive: boolean
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_type?: string
          created_at?: string
          email?: string | null
          gst_inclusive?: boolean
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_type?: string
          created_at?: string
          email?: string | null
          gst_inclusive?: boolean
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      config_history: {
        Row: {
          change_description: string | null
          changed_by: string | null
          company_id: string
          config_snapshot: Json
          config_type: string
          created_at: string
          id: string
          module: string
          version: number
        }
        Insert: {
          change_description?: string | null
          changed_by?: string | null
          company_id: string
          config_snapshot: Json
          config_type: string
          created_at?: string
          id?: string
          module: string
          version: number
        }
        Update: {
          change_description?: string | null
          changed_by?: string | null
          company_id?: string
          config_snapshot?: Json
          config_type?: string
          created_at?: string
          id?: string
          module?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "config_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_items: {
        Row: {
          batch_id: string | null
          batch_number: string | null
          company_id: string | null
          created_at: string
          credit_note_id: string
          discount_percentage: number
          gst_percentage: number
          id: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          batch_id?: string | null
          batch_number?: string | null
          company_id?: string | null
          created_at?: string
          credit_note_id: string
          discount_percentage?: number
          gst_percentage?: number
          id?: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          batch_id?: string | null
          batch_number?: string | null
          company_id?: string | null
          created_at?: string
          credit_note_id?: string
          discount_percentage?: number
          gst_percentage?: number
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          credit_note_number: string
          customer_name: string
          customer_phone: string | null
          gst_amount: number
          id: string
          notes: string | null
          original_invoice_id: string | null
          original_invoice_number: string
          reason: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number: string
          customer_name: string
          customer_phone?: string | null
          gst_amount?: number
          id?: string
          notes?: string | null
          original_invoice_id?: string | null
          original_invoice_number: string
          reason: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number?: string
          customer_name?: string
          customer_phone?: string | null
          gst_amount?: number
          id?: string
          notes?: string | null
          original_invoice_id?: string | null
          original_invoice_number?: string
          reason?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          company_id: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          total_purchases: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          total_purchases?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          total_purchases?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_note_items: {
        Row: {
          batch_id: string | null
          batch_number: string | null
          company_id: string | null
          created_at: string
          debit_note_id: string
          discount_percentage: number
          gst_percentage: number
          id: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          batch_id?: string | null
          batch_number?: string | null
          company_id?: string | null
          created_at?: string
          debit_note_id: string
          discount_percentage?: number
          gst_percentage?: number
          id?: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          batch_id?: string | null
          batch_number?: string | null
          company_id?: string | null
          created_at?: string
          debit_note_id?: string
          discount_percentage?: number
          gst_percentage?: number
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "debit_note_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_note_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_note_items_debit_note_id_fkey"
            columns: ["debit_note_id"]
            isOneToOne: false
            referencedRelation: "debit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_notes: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          debit_note_number: string
          gst_amount: number
          id: string
          notes: string | null
          original_order_id: string | null
          original_order_number: string
          reason: string
          status: string
          supplier_id: string | null
          supplier_name: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          debit_note_number: string
          gst_amount?: number
          id?: string
          notes?: string | null
          original_order_id?: string | null
          original_order_number: string
          reason: string
          status?: string
          supplier_id?: string | null
          supplier_name: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          debit_note_number?: string
          gst_amount?: number
          id?: string
          notes?: string | null
          original_order_id?: string | null
          original_order_number?: string
          reason?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debit_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_original_order_id_fkey"
            columns: ["original_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          registration_number: string | null
          speciality: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          registration_number?: string | null
          speciality?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          registration_number?: string | null
          speciality?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_years: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          status: Database["public"]["Enums"]["fy_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: Database["public"]["Enums"]["fy_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: Database["public"]["Enums"]["fy_status"]
          updated_at?: string
        }
        Relationships: []
      }
      form_configs: {
        Row: {
          company_id: string
          config_version: number
          created_at: string
          created_by: string | null
          fields: Json
          id: string
          is_active: boolean
          layout: Json
          module: string
          sections: Json
          ui_overrides: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          config_version?: number
          created_at?: string
          created_by?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          layout?: Json
          module: string
          sections?: Json
          ui_overrides?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          config_version?: number
          created_at?: string
          created_by?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          layout?: Json
          module?: string
          sections?: Json
          ui_overrides?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          details: Json
          financial_year_id: string | null
          id: string
          performed_by: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          details?: Json
          financial_year_id?: string | null
          id?: string
          performed_by: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          details?: Json
          financial_year_id?: string | null
          id?: string
          performed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_audit_logs_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_number: string
          company_id: string | null
          created_at: string
          expiry_date: string | null
          id: string
          manufacturing_date: string | null
          mrp: number
          product_id: string
          purchase_price: number
          quantity: number
          received_date: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          batch_number: string
          company_id?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          manufacturing_date?: string | null
          mrp: number
          product_id: string
          purchase_price: number
          quantity?: number
          received_date?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          batch_number?: string
          company_id?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          manufacturing_date?: string | null
          mrp?: number
          product_id?: string
          purchase_price?: number
          quantity?: number
          received_date?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          batch_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          rate: number
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          rate?: number
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          rate?: number
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
        }
        Relationships: []
      }
      invoice_sequences: {
        Row: {
          company_id: string
          created_at: string
          id: string
          last_number: number
          prefix: string
          updated_at: string
          year: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          last_number?: number
          prefix?: string
          updated_at?: string
          year: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          last_number?: number
          prefix?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          allow_negative_stock: boolean
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bill_discount_mode: string
          block_expired_sales: boolean
          company_address: string | null
          company_email: string | null
          company_gstin: string | null
          company_id: string
          company_name: string
          company_phone: string | null
          company_state: string | null
          created_at: string
          default_customer_name: string
          default_payment_method: string
          discount_before_tax: boolean
          discount_mode: string
          enable_batch_tracking: boolean
          enable_bill_discount: boolean
          enable_expiry_tracking: boolean
          expiry_required_default: boolean
          id: string
          invoice_format: string | null
          invoice_layout: string
          invoice_prefix: string | null
          logo_alignment: string
          logo_url: string | null
          max_discount_admin: number
          max_discount_pharmacist: number
          max_discount_staff: number
          prescription_check: Json
          print_alignment: string
          print_font_size: string
          show_amount_in_words: boolean | null
          show_batch_column: boolean
          show_customer_gstin: boolean | null
          show_discount_row: boolean
          show_due_date: boolean | null
          show_expiry_column: boolean
          show_free_qty_column: boolean
          show_gst_split: boolean
          show_hsn_column: boolean
          show_previous_balance: boolean | null
          show_rate_column: boolean
          show_roundoff: boolean
          show_salesperson: boolean
          show_ship_to: boolean | null
          show_tax_amount_column: boolean
          show_tax_summary: boolean | null
          terms_and_conditions: string | null
          updated_at: string
        }
        Insert: {
          allow_negative_stock?: boolean
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bill_discount_mode?: string
          block_expired_sales?: boolean
          company_address?: string | null
          company_email?: string | null
          company_gstin?: string | null
          company_id: string
          company_name?: string
          company_phone?: string | null
          company_state?: string | null
          created_at?: string
          default_customer_name?: string
          default_payment_method?: string
          discount_before_tax?: boolean
          discount_mode?: string
          enable_batch_tracking?: boolean
          enable_bill_discount?: boolean
          enable_expiry_tracking?: boolean
          expiry_required_default?: boolean
          id?: string
          invoice_format?: string | null
          invoice_layout?: string
          invoice_prefix?: string | null
          logo_alignment?: string
          logo_url?: string | null
          max_discount_admin?: number
          max_discount_pharmacist?: number
          max_discount_staff?: number
          prescription_check?: Json
          print_alignment?: string
          print_font_size?: string
          show_amount_in_words?: boolean | null
          show_batch_column?: boolean
          show_customer_gstin?: boolean | null
          show_discount_row?: boolean
          show_due_date?: boolean | null
          show_expiry_column?: boolean
          show_free_qty_column?: boolean
          show_gst_split?: boolean
          show_hsn_column?: boolean
          show_previous_balance?: boolean | null
          show_rate_column?: boolean
          show_roundoff?: boolean
          show_salesperson?: boolean
          show_ship_to?: boolean | null
          show_tax_amount_column?: boolean
          show_tax_summary?: boolean | null
          terms_and_conditions?: string | null
          updated_at?: string
        }
        Update: {
          allow_negative_stock?: boolean
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bill_discount_mode?: string
          block_expired_sales?: boolean
          company_address?: string | null
          company_email?: string | null
          company_gstin?: string | null
          company_id?: string
          company_name?: string
          company_phone?: string | null
          company_state?: string | null
          created_at?: string
          default_customer_name?: string
          default_payment_method?: string
          discount_before_tax?: boolean
          discount_mode?: string
          enable_batch_tracking?: boolean
          enable_bill_discount?: boolean
          enable_expiry_tracking?: boolean
          expiry_required_default?: boolean
          id?: string
          invoice_format?: string | null
          invoice_layout?: string
          invoice_prefix?: string | null
          logo_alignment?: string
          logo_url?: string | null
          max_discount_admin?: number
          max_discount_pharmacist?: number
          max_discount_staff?: number
          prescription_check?: Json
          print_alignment?: string
          print_font_size?: string
          show_amount_in_words?: boolean | null
          show_batch_column?: boolean
          show_customer_gstin?: boolean | null
          show_discount_row?: boolean
          show_due_date?: boolean | null
          show_expiry_column?: boolean
          show_free_qty_column?: boolean
          show_gst_split?: boolean
          show_hsn_column?: boolean
          show_previous_balance?: boolean | null
          show_rate_column?: boolean
          show_roundoff?: boolean
          show_salesperson?: boolean
          show_ship_to?: boolean | null
          show_tax_amount_column?: boolean
          show_tax_summary?: boolean | null
          terms_and_conditions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_balances: {
        Row: {
          balance_type: string
          company_id: string
          created_at: string
          credit_amount: number
          debit_amount: number
          financial_year_id: string
          id: string
          notes: string | null
          quantity: number | null
          reference_id: string
          reference_name: string
          updated_at: string
        }
        Insert: {
          balance_type: string
          company_id: string
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          financial_year_id: string
          id?: string
          notes?: string | null
          quantity?: number | null
          reference_id: string
          reference_name: string
          updated_at?: string
        }
        Update: {
          balance_type?: string
          company_id?: string
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          financial_year_id?: string
          id?: string
          notes?: string | null
          quantity?: number | null
          reference_id?: string
          reference_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opening_balances_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_name: string | null
          cheque_number: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          party_name: string
          party_type: string
          payment_date: string
          payment_method: string
          payment_type: string
          reference_id: string
          reference_number: string
          reference_type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_name?: string | null
          cheque_number?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          party_name: string
          party_type: string
          payment_date?: string
          payment_method?: string
          payment_type: string
          reference_id: string
          reference_number: string
          reference_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          cheque_number?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          party_name?: string
          party_type?: string
          payment_date?: string
          payment_method?: string
          payment_type?: string
          reference_id?: string
          reference_number?: string
          reference_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          batch_tracking_enabled: boolean
          category: string | null
          company_id: string | null
          composition: string | null
          created_at: string
          drug_schedule: Database["public"]["Enums"]["drug_schedule"]
          expiry_required: boolean | null
          generic_name: string | null
          gst_percentage: number
          hsn_code: string | null
          id: string
          is_active: boolean
          manufacturer: string
          max_stock_level: number
          min_stock_level: number
          mrp: number
          name: string
          purchase_price: number
          reorder_level: number
          sale_price: number | null
          strength: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          batch_tracking_enabled?: boolean
          category?: string | null
          company_id?: string | null
          composition?: string | null
          created_at?: string
          drug_schedule?: Database["public"]["Enums"]["drug_schedule"]
          expiry_required?: boolean | null
          generic_name?: string | null
          gst_percentage?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          manufacturer: string
          max_stock_level?: number
          min_stock_level?: number
          mrp: number
          name: string
          purchase_price: number
          reorder_level?: number
          sale_price?: number | null
          strength?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          batch_tracking_enabled?: boolean
          category?: string | null
          company_id?: string | null
          composition?: string | null
          created_at?: string
          drug_schedule?: Database["public"]["Enums"]["drug_schedule"]
          expiry_required?: boolean | null
          generic_name?: string | null
          gst_percentage?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          manufacturer?: string
          max_stock_level?: number
          min_stock_level?: number
          mrp?: number
          name?: string
          purchase_price?: number
          reorder_level?: number
          sale_price?: number | null
          strength?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_module: string
          company_id: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_module?: string
          company_id?: string | null
          created_at?: string
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_module?: string
          company_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          company_id: string | null
          created_at: string
          discount_percentage: number
          free_quantity: number
          gst_percentage: number
          id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          discount_percentage?: number
          free_quantity?: number
          gst_percentage: number
          id?: string
          product_id: string
          purchase_order_id: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          discount_percentage?: number
          free_quantity?: number
          gst_percentage?: number
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          challan_number: string | null
          company_id: string | null
          converted_from_challan_id: string | null
          created_at: string
          created_by: string | null
          discount_amount: number
          expected_delivery_date: string | null
          freight_charges: number
          gst_amount: number
          handling_charges: number
          id: string
          invoice_number: string | null
          is_challan: boolean | null
          notes: string | null
          order_date: string
          order_number: string
          other_charges: number
          status: Database["public"]["Enums"]["order_status"]
          supplier_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          challan_number?: string | null
          company_id?: string | null
          converted_from_challan_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          freight_charges?: number
          gst_amount?: number
          handling_charges?: number
          id?: string
          invoice_number?: string | null
          is_challan?: boolean | null
          notes?: string | null
          order_date?: string
          order_number: string
          other_charges?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          challan_number?: string | null
          company_id?: string | null
          converted_from_challan_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          freight_charges?: number
          gst_amount?: number
          handling_charges?: number
          id?: string
          invoice_number?: string | null
          is_challan?: boolean | null
          notes?: string | null
          order_date?: string
          order_number?: string
          other_charges?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_converted_from_challan_id_fkey"
            columns: ["converted_from_challan_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          batch_id: string
          company_id: string | null
          created_at: string
          discount_percentage: number
          free_quantity: number
          gst_percentage: number
          id: string
          product_id: string
          quantity: number
          sales_order_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          batch_id: string
          company_id?: string | null
          created_at?: string
          discount_percentage?: number
          free_quantity?: number
          gst_percentage: number
          id?: string
          product_id: string
          quantity: number
          sales_order_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          batch_id?: string
          company_id?: string | null
          created_at?: string
          discount_percentage?: number
          free_quantity?: number
          gst_percentage?: number
          id?: string
          product_id?: string
          quantity?: number
          sales_order_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          amount_paid: number
          company_id: string | null
          created_at: string
          created_by: string | null
          credit_period_days: number | null
          customer_address: string | null
          customer_gstin: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          delivery_charges: number
          discount_amount: number
          doctor_id: string | null
          doctor_name: string | null
          doctor_registration_number: string | null
          due_date: string | null
          freight_charges: number
          gst_amount: number
          handling_charges: number
          id: string
          invoice_number: string
          notes: string | null
          other_charges: number
          payment_method: string | null
          payment_status: string
          prescription_date: string | null
          prescription_duration_days: number | null
          prescription_number: string | null
          reminder_enabled: boolean
          sale_date: string
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_period_days?: number | null
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_charges?: number
          discount_amount?: number
          doctor_id?: string | null
          doctor_name?: string | null
          doctor_registration_number?: string | null
          due_date?: string | null
          freight_charges?: number
          gst_amount?: number
          handling_charges?: number
          id?: string
          invoice_number: string
          notes?: string | null
          other_charges?: number
          payment_method?: string | null
          payment_status?: string
          prescription_date?: string | null
          prescription_duration_days?: number | null
          prescription_number?: string | null
          reminder_enabled?: boolean
          sale_date?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_period_days?: number | null
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_charges?: number
          discount_amount?: number
          doctor_id?: string | null
          doctor_name?: string | null
          doctor_registration_number?: string | null
          due_date?: string | null
          freight_charges?: number
          gst_amount?: number
          handling_charges?: number
          id?: string
          invoice_number?: string
          notes?: string | null
          other_charges?: number
          payment_method?: string | null
          payment_status?: string
          prescription_date?: string | null
          prescription_duration_days?: number | null
          prescription_number?: string | null
          reminder_enabled?: boolean
          sale_date?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_drug_register: {
        Row: {
          balance_quantity: number
          batch_id: string
          company_id: string | null
          created_at: string
          doctor_name: string | null
          doctor_registration_number: string | null
          id: string
          notes: string | null
          patient_name: string | null
          prescription_number: string | null
          product_id: string
          quantity: number
          recorded_by: string
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          balance_quantity: number
          batch_id: string
          company_id?: string | null
          created_at?: string
          doctor_name?: string | null
          doctor_registration_number?: string | null
          id?: string
          notes?: string | null
          patient_name?: string | null
          prescription_number?: string | null
          product_id: string
          quantity: number
          recorded_by: string
          transaction_date?: string
          transaction_type: string
        }
        Update: {
          balance_quantity?: number
          batch_id?: string
          company_id?: string | null
          created_at?: string
          doctor_name?: string | null
          doctor_registration_number?: string | null
          id?: string
          notes?: string | null
          patient_name?: string | null
          prescription_number?: string | null
          product_id?: string
          quantity?: number
          recorded_by?: string
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_drug_register_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_drug_register_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_drug_register_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          company_id: string | null
          contact_person: string | null
          created_at: string
          drug_license_number: string | null
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          drug_license_number?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          drug_license_number?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_sessions: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          input_gst: number
          net_tax_liability: number
          notes: string | null
          output_gst: number
          period_month: number
          period_name: string
          period_year: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          input_gst?: number
          net_tax_liability?: number
          notes?: string | null
          output_gst?: number
          period_month: number
          period_name: string
          period_year: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          input_gst?: number
          net_tax_liability?: number
          notes?: string | null
          output_gst?: number
          period_month?: number
          period_name?: string
          period_year?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_batches_fifo: {
        Args: {
          _company_id: string
          _exclude_batch_quantities?: Json
          _product_id: string
          _requested_quantity: number
        }
        Returns: Json
      }
      complete_onboarding: {
        Args: { _business_type: string; _company_name: string }
        Returns: string
      }
      deduct_batch_quantity: {
        Args: { _batch_id: string; _quantity: number }
        Returns: number
      }
      deduct_sale_inventory: { Args: { _items: Json }; Returns: Json }
      dispose_expired_batch: {
        Args: { _batch_id: string; _notes?: string; _quantity: number }
        Returns: Json
      }
      get_current_financial_year: {
        Args: { _company_id: string }
        Returns: string
      }
      get_fy_name: { Args: { _date: string }; Returns: string }
      get_next_invoice_number: {
        Args: { _company_id: string; _prefix?: string }
        Returns: string
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      process_supplier_return: {
        Args: {
          _batch_id: string
          _debit_note_id?: string
          _notes?: string
          _quantity: number
          _reason: string
        }
        Returns: Json
      }
      receive_purchase_batches: {
        Args: { _batches: Json; _purchase_order_id?: string }
        Returns: Json
      }
      restore_sale_inventory: { Args: { _items: Json }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "pharmacist" | "staff" | "super_admin"
      drug_schedule:
        | "none"
        | "schedule_h"
        | "schedule_h1"
        | "schedule_x"
        | "narcotic"
      fy_status: "active" | "closed" | "archived"
      order_status:
        | "pending"
        | "confirmed"
        | "shipped"
        | "delivered"
        | "cancelled"
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "pharmacist", "staff", "super_admin"],
      drug_schedule: [
        "none",
        "schedule_h",
        "schedule_h1",
        "schedule_x",
        "narcotic",
      ],
      fy_status: ["active", "closed", "archived"],
      order_status: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
