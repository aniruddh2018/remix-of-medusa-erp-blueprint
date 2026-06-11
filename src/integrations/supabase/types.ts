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
      batch_conversions: {
        Row: {
          batch_id: string
          company_id: string
          conversion_factor: number
          created_at: string
          from_unit: string
          id: string
          product_id: string
          to_unit: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          company_id: string
          conversion_factor: number
          created_at?: string
          from_unit: string
          id?: string
          product_id: string
          to_unit: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          company_id?: string
          conversion_factor?: number
          created_at?: string
          from_unit?: string
          id?: string
          product_id?: string
          to_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_conversions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_conversions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
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
      conversion_audit: {
        Row: {
          batch_id: string | null
          company_id: string
          conversion_factor: number
          created_at: string
          created_by: string | null
          from_unit: string
          id: string
          product_id: string | null
          reference_id: string | null
          reference_type: string | null
          resolution_path: string
          to_unit: string
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          conversion_factor: number
          created_at?: string
          created_by?: string | null
          from_unit: string
          id?: string
          product_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resolution_path: string
          to_unit: string
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          conversion_factor?: number
          created_at?: string
          created_by?: string | null
          from_unit?: string
          id?: string
          product_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resolution_path?: string
          to_unit?: string
        }
        Relationships: []
      }
      credit_note_items: {
        Row: {
          batch_id: string | null
          batch_number: string | null
          company_id: string | null
          created_at: string
          credit_note_id: string
          deleted: boolean
          device_id: string | null
          discount_percentage: number
          gst_percentage: number
          id: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
          updated_at: string
          version: number
        }
        Insert: {
          batch_id?: string | null
          batch_number?: string | null
          company_id?: string | null
          created_at?: string
          credit_note_id: string
          deleted?: boolean
          device_id?: string | null
          discount_percentage?: number
          gst_percentage?: number
          id?: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
          updated_at?: string
          version?: number
        }
        Update: {
          batch_id?: string | null
          batch_number?: string | null
          company_id?: string | null
          created_at?: string
          credit_note_id?: string
          deleted?: boolean
          device_id?: string | null
          discount_percentage?: number
          gst_percentage?: number
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
          updated_at?: string
          version?: number
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
          deleted: boolean
          device_id: string | null
          gst_amount: number
          id: string
          notes: string | null
          original_invoice_id: string | null
          original_invoice_number: string
          reason: string
          status: string
          total_amount: number
          updated_at: string
          version: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number: string
          customer_name: string
          customer_phone?: string | null
          deleted?: boolean
          device_id?: string | null
          gst_amount?: number
          id?: string
          notes?: string | null
          original_invoice_id?: string | null
          original_invoice_number: string
          reason: string
          status?: string
          total_amount?: number
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number?: string
          customer_name?: string
          customer_phone?: string | null
          deleted?: boolean
          device_id?: string | null
          gst_amount?: number
          id?: string
          notes?: string | null
          original_invoice_id?: string | null
          original_invoice_number?: string
          reason?: string
          status?: string
          total_amount?: number
          updated_at?: string
          version?: number
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
      custom_calculations: {
        Row: {
          aggregation: string | null
          company_id: string
          created_at: string | null
          created_by: string
          description: string | null
          formula: string
          id: string
          is_public: boolean | null
          name: string
          result_format: string | null
          updated_at: string | null
          variables: Json
        }
        Insert: {
          aggregation?: string | null
          company_id: string
          created_at?: string | null
          created_by: string
          description?: string | null
          formula: string
          id?: string
          is_public?: boolean | null
          name: string
          result_format?: string | null
          updated_at?: string | null
          variables?: Json
        }
        Update: {
          aggregation?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          formula?: string
          id?: string
          is_public?: boolean | null
          name?: string
          result_format?: string | null
          updated_at?: string | null
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "custom_calculations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          company_id: string | null
          created_at: string
          deleted: boolean
          device_id: string | null
          email: string | null
          gst_number: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          total_purchases: number
          updated_at: string
          version: number
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          total_purchases?: number
          updated_at?: string
          version?: number
        }
        Update: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          total_purchases?: number
          updated_at?: string
          version?: number
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
      data_favorites: {
        Row: {
          created_at: string | null
          filters: Json | null
          id: string
          name: string
          query_template_id: string | null
          saved_query_text: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          filters?: Json | null
          id?: string
          name: string
          query_template_id?: string | null
          saved_query_text?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          filters?: Json | null
          id?: string
          name?: string
          query_template_id?: string | null
          saved_query_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_favorites_query_template_id_fkey"
            columns: ["query_template_id"]
            isOneToOne: false
            referencedRelation: "query_templates"
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
          deleted: boolean
          device_id: string | null
          discount_percentage: number
          gst_percentage: number
          id: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
          updated_at: string
          version: number
        }
        Insert: {
          batch_id?: string | null
          batch_number?: string | null
          company_id?: string | null
          created_at?: string
          debit_note_id: string
          deleted?: boolean
          device_id?: string | null
          discount_percentage?: number
          gst_percentage?: number
          id?: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
          updated_at?: string
          version?: number
        }
        Update: {
          batch_id?: string | null
          batch_number?: string | null
          company_id?: string | null
          created_at?: string
          debit_note_id?: string
          deleted?: boolean
          device_id?: string | null
          discount_percentage?: number
          gst_percentage?: number
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
          updated_at?: string
          version?: number
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
          deleted: boolean
          device_id: string | null
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
          version: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          debit_note_number: string
          deleted?: boolean
          device_id?: string | null
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
          version?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          debit_note_number?: string
          deleted?: boolean
          device_id?: string | null
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
          version?: number
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
      devices: {
        Row: {
          app_version: string | null
          company_id: string | null
          created_at: string
          device_name: string | null
          id: string
          last_seen_at: string
          last_sync: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          company_id?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          last_sync?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          company_id?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          last_sync?: string | null
          user_id?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          deleted: boolean
          device_id: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          registration_number: string | null
          speciality: string | null
          updated_at: string
          version: number
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          registration_number?: string | null
          speciality?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          registration_number?: string | null
          speciality?: string | null
          updated_at?: string
          version?: number
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
      erp_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          company_id: string | null
          created_at: string
          id: string
          metadata: Json
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_audit_logs_company_id_fkey"
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
      gst_tax_structures: {
        Row: {
          cess_rate: number | null
          cgst_rate: number | null
          company_id: string
          created_at: string | null
          description: string | null
          effective_from: string | null
          gst_rate: number
          hsn_code: string | null
          id: string
          igst_rate: number | null
          is_active: boolean
          sgst_rate: number | null
        }
        Insert: {
          cess_rate?: number | null
          cgst_rate?: number | null
          company_id: string
          created_at?: string | null
          description?: string | null
          effective_from?: string | null
          gst_rate: number
          hsn_code?: string | null
          id?: string
          igst_rate?: number | null
          is_active?: boolean
          sgst_rate?: number | null
        }
        Update: {
          cess_rate?: number | null
          cgst_rate?: number | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          effective_from?: string | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          igst_rate?: number | null
          is_active?: boolean
          sgst_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_tax_structures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          company_id: string
          created_at: string | null
          entity_type: string
          error_log: Json | null
          failed_rows: number | null
          file_name: string | null
          file_type: string | null
          id: string
          mapping_config: Json | null
          session_id: string | null
          status: string
          success_rows: number | null
          total_rows: number | null
          updated_at: string | null
          user_id: string | null
          validation_results: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          entity_type: string
          error_log?: Json | null
          failed_rows?: number | null
          file_name?: string | null
          file_type?: string | null
          id?: string
          mapping_config?: Json | null
          session_id?: string | null
          status?: string
          success_rows?: number | null
          total_rows?: number | null
          updated_at?: string | null
          user_id?: string | null
          validation_results?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          entity_type?: string
          error_log?: Json | null
          failed_rows?: number | null
          file_name?: string | null
          file_type?: string | null
          id?: string
          mapping_config?: Json | null
          session_id?: string | null
          status?: string
          success_rows?: number | null
          total_rows?: number | null
          updated_at?: string | null
          user_id?: string | null
          validation_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "import_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      import_mappings: {
        Row: {
          company_id: string
          confidence: number | null
          created_at: string | null
          entity_type: string
          id: string
          is_ai_generated: boolean | null
          job_id: string | null
          source_field: string
          target_field: string
          transformation: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          confidence?: number | null
          created_at?: string | null
          entity_type: string
          id?: string
          is_ai_generated?: boolean | null
          job_id?: string | null
          source_field: string
          target_field: string
          transformation?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          confidence?: number | null
          created_at?: string | null
          entity_type?: string
          id?: string
          is_ai_generated?: boolean | null
          job_id?: string | null
          source_field?: string
          target_field?: string
          transformation?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_mappings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_sessions: {
        Row: {
          company_id: string
          created_at: string | null
          error_log: Json | null
          file_name: string | null
          file_size: number | null
          id: string
          import_summary: Json | null
          name: string
          parse_summary: Json | null
          source_system: string
          staging_summary: Json | null
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          error_log?: Json | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          import_summary?: Json | null
          name?: string
          parse_summary?: Json | null
          source_system?: string
          staging_summary?: Json | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          error_log?: Json | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          import_summary?: Json | null
          name?: string
          parse_summary?: Json | null
          source_system?: string
          staging_summary?: Json | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_templates: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          entity_type: string
          field_mappings: Json
          id: string
          is_system: boolean | null
          name: string
          source_system: string
          transformations: Json | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          entity_type: string
          field_mappings?: Json
          id?: string
          is_system?: boolean | null
          name: string
          source_system?: string
          transformations?: Json | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          entity_type?: string
          field_mappings?: Json
          id?: string
          is_system?: boolean | null
          name?: string
          source_system?: string
          transformations?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_number: string
          company_id: string | null
          created_at: string
          deleted: boolean
          device_id: string | null
          expiry_date: string | null
          id: string
          loose_quantity: number
          manufacturing_date: string | null
          mrp: number
          pack_size: number | null
          product_id: string
          purchase_price: number
          quantity: number
          received_date: string
          supplier_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          batch_number: string
          company_id?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          expiry_date?: string | null
          id?: string
          loose_quantity?: number
          manufacturing_date?: string | null
          mrp: number
          pack_size?: number | null
          product_id: string
          purchase_price: number
          quantity?: number
          received_date?: string
          supplier_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          batch_number?: string
          company_id?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          expiry_date?: string | null
          id?: string
          loose_quantity?: number
          manufacturing_date?: string | null
          mrp?: number
          pack_size?: number | null
          product_id?: string
          purchase_price?: number
          quantity?: number
          received_date?: string
          supplier_id?: string | null
          updated_at?: string
          version?: number
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
          deleted: boolean
          device_id: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          rate: number
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
          updated_at: string
          version: number
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          device_id?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          rate?: number
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
          updated_at?: string
          version?: number
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          device_id?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          rate?: number
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      invoice_scan_queue: {
        Row: {
          company_id: string
          completed_at: string | null
          error_message: string | null
          file_paths: string[]
          id: string
          max_retries: number | null
          priority: number | null
          queued_at: string
          result: Json | null
          retry_count: number | null
          stage: string | null
          stage_progress: number | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          error_message?: string | null
          file_paths: string[]
          id?: string
          max_retries?: number | null
          priority?: number | null
          queued_at?: string
          result?: Json | null
          retry_count?: number | null
          stage?: string | null
          stage_progress?: number | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          error_message?: string | null
          file_paths?: string[]
          id?: string
          max_retries?: number | null
          priority?: number | null
          queued_at?: string
          result?: Json | null
          retry_count?: number | null
          stage?: string | null
          stage_progress?: number | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_scan_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      journal_voucher_lines: {
        Row: {
          company_id: string
          created_at: string | null
          credit_amount: number
          debit_amount: number
          id: string
          ledger_id: string
          narration: string | null
          voucher_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          credit_amount?: number
          debit_amount?: number
          id?: string
          ledger_id: string
          narration?: string | null
          voucher_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          credit_amount?: number
          debit_amount?: number
          id?: string
          ledger_id?: string
          narration?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_voucher_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers_with_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "party_transaction_history"
            referencedColumns: ["ledger_id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "journal_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "ledger_transaction_history"
            referencedColumns: ["voucher_id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "party_transaction_history"
            referencedColumns: ["voucher_id"]
          },
        ]
      }
      journal_vouchers: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          narration: string
          reference_id: string | null
          reference_number: string | null
          reference_type: Database["public"]["Enums"]["journal_reference_type"]
          total_amount: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          narration?: string
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: Database["public"]["Enums"]["journal_reference_type"]
          total_amount?: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          narration?: string
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: Database["public"]["Enums"]["journal_reference_type"]
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_vouchers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_audit_log: {
        Row: {
          action: string
          changed_fields: string[] | null
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          ledger_id: string | null
          new_values: Json | null
          old_values: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          ledger_id?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          ledger_id?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_audit_log_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_audit_log_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_audit_log_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers_with_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_audit_log_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "party_transaction_history"
            referencedColumns: ["ledger_id"]
          },
        ]
      }
      ledger_balances: {
        Row: {
          closing_balance: number
          closing_balance_type: Database["public"]["Enums"]["balance_type"]
          company_id: string
          created_at: string | null
          current_balance: number
          financial_year: string
          id: string
          ledger_id: string
          opening_balance: number
          opening_balance_type: Database["public"]["Enums"]["balance_type"]
          total_credit: number
          total_debit: number
          updated_at: string | null
        }
        Insert: {
          closing_balance?: number
          closing_balance_type?: Database["public"]["Enums"]["balance_type"]
          company_id: string
          created_at?: string | null
          current_balance?: number
          financial_year: string
          id?: string
          ledger_id: string
          opening_balance?: number
          opening_balance_type?: Database["public"]["Enums"]["balance_type"]
          total_credit?: number
          total_debit?: number
          updated_at?: string | null
        }
        Update: {
          closing_balance?: number
          closing_balance_type?: Database["public"]["Enums"]["balance_type"]
          company_id?: string
          created_at?: string | null
          current_balance?: number
          financial_year?: string
          id?: string
          ledger_id?: string
          opening_balance?: number
          opening_balance_type?: Database["public"]["Enums"]["balance_type"]
          total_credit?: number
          total_debit?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_balances_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_balances_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_balances_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers_with_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_balances_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "party_transaction_history"
            referencedColumns: ["ledger_id"]
          },
        ]
      }
      ledger_groups: {
        Row: {
          affects_stock: boolean
          company_id: string
          created_at: string | null
          group_type: Database["public"]["Enums"]["ledger_group_type"]
          id: string
          is_active: boolean
          is_system: boolean
          level: number
          materialized_path: string
          name: string
          parent_id: string | null
          sort_order: number
          source_system: string | null
          updated_at: string | null
        }
        Insert: {
          affects_stock?: boolean
          company_id: string
          created_at?: string | null
          group_type?: Database["public"]["Enums"]["ledger_group_type"]
          id?: string
          is_active?: boolean
          is_system?: boolean
          level?: number
          materialized_path?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          source_system?: string | null
          updated_at?: string | null
        }
        Update: {
          affects_stock?: boolean
          company_id?: string
          created_at?: string | null
          group_type?: Database["public"]["Enums"]["ledger_group_type"]
          id?: string
          is_active?: boolean
          is_system?: boolean
          level?: number
          materialized_path?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          source_system?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ledger_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_import_sessions: {
        Row: {
          company_id: string
          created_at: string | null
          duplicate_groups: number | null
          duplicate_ledgers: number | null
          error_log: Json | null
          file_name: string | null
          file_size: number | null
          groups_failed: number | null
          groups_imported: number | null
          id: string
          ledgers_failed: number | null
          ledgers_imported: number | null
          name: string
          source_system: string
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          duplicate_groups?: number | null
          duplicate_ledgers?: number | null
          error_log?: Json | null
          file_name?: string | null
          file_size?: number | null
          groups_failed?: number | null
          groups_imported?: number | null
          id?: string
          ledgers_failed?: number | null
          ledgers_imported?: number | null
          name: string
          source_system?: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          duplicate_groups?: number | null
          duplicate_ledgers?: number | null
          error_log?: Json | null
          file_name?: string | null
          file_size?: number | null
          groups_failed?: number | null
          groups_imported?: number | null
          id?: string
          ledgers_failed?: number | null
          ledgers_imported?: number | null
          name?: string
          source_system?: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_import_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_roles: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          is_primary: boolean
          ledger_id: string
          metadata: Json | null
          priority: number
          role_type: Database["public"]["Enums"]["ledger_role_type"]
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean
          ledger_id: string
          metadata?: Json | null
          priority?: number
          role_type: Database["public"]["Enums"]["ledger_role_type"]
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean
          ledger_id?: string
          metadata?: Json | null
          priority?: number
          role_type?: Database["public"]["Enums"]["ledger_role_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ledger_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_roles_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_roles_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_roles_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers_with_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_roles_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "party_transaction_history"
            referencedColumns: ["ledger_id"]
          },
        ]
      }
      ledgers: {
        Row: {
          address: Json | null
          alias: string | null
          balance_type: Database["public"]["Enums"]["balance_type"]
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          billing_address: Json | null
          city: string | null
          company_id: string
          contact_person: string | null
          country: string | null
          created_at: string | null
          current_balance: number
          email: string | null
          gst_number: string | null
          gst_registration_type: string | null
          id: string
          import_metadata: Json | null
          is_active: boolean
          ledger_code: string | null
          ledger_group_id: string | null
          mobile: string | null
          name: string
          opening_balance: number
          pan_number: string | null
          party_type: string | null
          phone: string | null
          pincode: string | null
          shipping_address: Json | null
          source_group_name: string | null
          source_ledger_name: string | null
          source_system: string | null
          state: string | null
          tax_id: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: Json | null
          alias?: string | null
          balance_type?: Database["public"]["Enums"]["balance_type"]
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          billing_address?: Json | null
          city?: string | null
          company_id: string
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          current_balance?: number
          email?: string | null
          gst_number?: string | null
          gst_registration_type?: string | null
          id?: string
          import_metadata?: Json | null
          is_active?: boolean
          ledger_code?: string | null
          ledger_group_id?: string | null
          mobile?: string | null
          name: string
          opening_balance?: number
          pan_number?: string | null
          party_type?: string | null
          phone?: string | null
          pincode?: string | null
          shipping_address?: Json | null
          source_group_name?: string | null
          source_ledger_name?: string | null
          source_system?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: Json | null
          alias?: string | null
          balance_type?: Database["public"]["Enums"]["balance_type"]
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          billing_address?: Json | null
          city?: string | null
          company_id?: string
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          current_balance?: number
          email?: string | null
          gst_number?: string | null
          gst_registration_type?: string | null
          id?: string
          import_metadata?: Json | null
          is_active?: boolean
          ledger_code?: string | null
          ledger_group_id?: string | null
          mobile?: string | null
          name?: string
          opening_balance?: number
          pan_number?: string | null
          party_type?: string | null
          phone?: string | null
          pincode?: string | null
          shipping_address?: Json | null
          source_group_name?: string | null
          source_ledger_name?: string | null
          source_system?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledgers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledgers_ledger_group_id_fkey"
            columns: ["ledger_group_id"]
            isOneToOne: false
            referencedRelation: "ledger_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturers: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          source_system: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          source_system?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          source_system?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manufacturers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
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
          deleted: boolean
          device_id: string | null
          id: string
          ledger_id: string | null
          notes: string | null
          party_name: string
          party_type: string
          payment_date: string
          payment_method: string
          payment_type: string
          reference_id: string
          reference_number: string
          reference_type: string
          skip_voucher_posting: boolean
          updated_at: string
          version: number
        }
        Insert: {
          amount?: number
          bank_name?: string | null
          cheque_number?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          device_id?: string | null
          id?: string
          ledger_id?: string | null
          notes?: string | null
          party_name: string
          party_type: string
          payment_date?: string
          payment_method?: string
          payment_type: string
          reference_id: string
          reference_number: string
          reference_type: string
          skip_voucher_posting?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          amount?: number
          bank_name?: string | null
          cheque_number?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          device_id?: string | null
          id?: string
          ledger_id?: string | null
          notes?: string | null
          party_name?: string
          party_type?: string
          payment_date?: string
          payment_method?: string
          payment_type?: string
          reference_id?: string
          reference_number?: string
          reference_type?: string
          skip_voucher_posting?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers_with_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "party_transaction_history"
            referencedColumns: ["ledger_id"]
          },
        ]
      }
      product_conversions: {
        Row: {
          company_id: string
          conversion_factor: number
          created_at: string
          from_unit: string
          id: string
          is_active: boolean
          product_id: string
          to_unit: string
          updated_at: string
        }
        Insert: {
          company_id: string
          conversion_factor: number
          created_at?: string
          from_unit: string
          id?: string
          is_active?: boolean
          product_id: string
          to_unit: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          conversion_factor?: number
          created_at?: string
          from_unit?: string
          id?: string
          is_active?: boolean
          product_id?: string
          to_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_conversions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_embeddings: {
        Row: {
          company_id: string
          embedding: string
          generated_at: string
          id: string
          model: string
          product_id: string
        }
        Insert: {
          company_id: string
          embedding: string
          generated_at?: string
          id?: string
          model?: string
          product_id: string
        }
        Update: {
          company_id?: string
          embedding?: string
          generated_at?: string
          id?: string
          model?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_embeddings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_embeddings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_mapping_review_queue: {
        Row: {
          company_id: string
          confidence_score: number
          created_at: string
          extracted_name: string
          id: string
          invoice_id: string | null
          matching_method: string
          normalized_name: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_product_id: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          confidence_score: number
          created_at?: string
          extracted_name: string
          id?: string
          invoice_id?: string | null
          matching_method: string
          normalized_name: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_product_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          confidence_score?: number
          created_at?: string
          extracted_name?: string
          id?: string
          invoice_id?: string | null
          matching_method?: string
          normalized_name?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_product_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_mapping_review_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_mapping_review_queue_suggested_product_id_fkey"
            columns: ["suggested_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_mapping_review_queue_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_mapping_stats: {
        Row: {
          auto_mapped: number | null
          avg_confidence_score: number | null
          company_id: string | null
          created_at: string
          date: string
          duplicates_prevented: number | null
          human_approved: number | null
          id: string
          new_products_created: number | null
          total_scans: number | null
          updated_at: string
        }
        Insert: {
          auto_mapped?: number | null
          avg_confidence_score?: number | null
          company_id?: string | null
          created_at?: string
          date: string
          duplicates_prevented?: number | null
          human_approved?: number | null
          id?: string
          new_products_created?: number | null
          total_scans?: number | null
          updated_at?: string
        }
        Update: {
          auto_mapped?: number | null
          avg_confidence_score?: number | null
          company_id?: string | null
          created_at?: string
          date?: string
          duplicates_prevented?: number | null
          human_approved?: number | null
          id?: string
          new_products_created?: number | null
          total_scans?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_mapping_stats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_unit: string | null
          batch_tracking_enabled: boolean
          brand: string | null
          canonical_name: string | null
          category: string | null
          company_id: string | null
          composition: string | null
          created_at: string
          deleted: boolean
          device_id: string | null
          drug_schedule: Database["public"]["Enums"]["drug_schedule"]
          embedding: string | null
          embedding_needs_update: boolean
          expiry_required: boolean | null
          fingerprint: string | null
          form: string | null
          generic_name: string | null
          gst_percentage: number
          hsn_code: string | null
          id: string
          is_active: boolean
          manufacturer: string
          manufacturer_id: string | null
          max_stock_level: number
          min_stock_level: number
          mrp: number
          name: string
          pack_size: string | null
          purchase_price: number
          reorder_level: number
          sale_price: number | null
          strength: string | null
          unit: string
          updated_at: string
          version: number
        }
        Insert: {
          base_unit?: string | null
          batch_tracking_enabled?: boolean
          brand?: string | null
          canonical_name?: string | null
          category?: string | null
          company_id?: string | null
          composition?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          drug_schedule?: Database["public"]["Enums"]["drug_schedule"]
          embedding?: string | null
          embedding_needs_update?: boolean
          expiry_required?: boolean | null
          fingerprint?: string | null
          form?: string | null
          generic_name?: string | null
          gst_percentage?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          manufacturer: string
          manufacturer_id?: string | null
          max_stock_level?: number
          min_stock_level?: number
          mrp: number
          name: string
          pack_size?: string | null
          purchase_price: number
          reorder_level?: number
          sale_price?: number | null
          strength?: string | null
          unit?: string
          updated_at?: string
          version?: number
        }
        Update: {
          base_unit?: string | null
          batch_tracking_enabled?: boolean
          brand?: string | null
          canonical_name?: string | null
          category?: string | null
          company_id?: string | null
          composition?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          drug_schedule?: Database["public"]["Enums"]["drug_schedule"]
          embedding?: string | null
          embedding_needs_update?: boolean
          expiry_required?: boolean | null
          fingerprint?: string | null
          form?: string | null
          generic_name?: string | null
          gst_percentage?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          manufacturer?: string
          manufacturer_id?: string | null
          max_stock_level?: number
          min_stock_level?: number
          mrp?: number
          name?: string
          pack_size?: string | null
          purchase_price?: number
          reorder_level?: number
          sale_price?: number | null
          strength?: string | null
          unit?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
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
          base_quantity: number | null
          company_id: string | null
          created_at: string
          deleted: boolean
          device_id: string | null
          discount_percentage: number
          free_quantity: number
          gst_percentage: number
          id: string
          product_id: string
          purchase_order_id: string
          purchased_unit: string | null
          quantity: number
          total_price: number
          unit_price: number
          updated_at: string
          version: number
        }
        Insert: {
          base_quantity?: number | null
          company_id?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          discount_percentage?: number
          free_quantity?: number
          gst_percentage: number
          id?: string
          product_id: string
          purchase_order_id: string
          purchased_unit?: string | null
          quantity: number
          total_price: number
          unit_price: number
          updated_at?: string
          version?: number
        }
        Update: {
          base_quantity?: number | null
          company_id?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          discount_percentage?: number
          free_quantity?: number
          gst_percentage?: number
          id?: string
          product_id?: string
          purchase_order_id?: string
          purchased_unit?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
          updated_at?: string
          version?: number
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
          deleted: boolean
          device_id: string | null
          discount_amount: number
          expected_delivery_date: string | null
          freight_charges: number
          gst_amount: number
          handling_charges: number
          id: string
          invoice_number: string | null
          is_challan: boolean | null
          ledger_id: string | null
          notes: string | null
          order_date: string
          order_number: string
          other_charges: number
          status: Database["public"]["Enums"]["order_status"]
          supplier_id: string
          total_amount: number
          updated_at: string
          version: number
        }
        Insert: {
          challan_number?: string | null
          company_id?: string | null
          converted_from_challan_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          device_id?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          freight_charges?: number
          gst_amount?: number
          handling_charges?: number
          id?: string
          invoice_number?: string | null
          is_challan?: boolean | null
          ledger_id?: string | null
          notes?: string | null
          order_date?: string
          order_number: string
          other_charges?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_id: string
          total_amount?: number
          updated_at?: string
          version?: number
        }
        Update: {
          challan_number?: string | null
          company_id?: string | null
          converted_from_challan_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          device_id?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          freight_charges?: number
          gst_amount?: number
          handling_charges?: number
          id?: string
          invoice_number?: string | null
          is_challan?: boolean | null
          ledger_id?: string | null
          notes?: string | null
          order_date?: string
          order_number?: string
          other_charges?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_id?: string
          total_amount?: number
          updated_at?: string
          version?: number
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
            foreignKeyName: "purchase_orders_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers_with_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "party_transaction_history"
            referencedColumns: ["ledger_id"]
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
      query_history: {
        Row: {
          company_id: string
          created_at: string | null
          execution_time_ms: number | null
          generated_sql: string | null
          id: string
          ip_address: unknown
          query_text: string
          query_type: string
          row_count: number | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          execution_time_ms?: number | null
          generated_sql?: string | null
          id?: string
          ip_address?: unknown
          query_text: string
          query_type?: string
          row_count?: number | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          execution_time_ms?: number | null
          generated_sql?: string | null
          id?: string
          ip_address?: unknown
          query_text?: string
          query_type?: string
          row_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "query_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      query_templates: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string
          default_format: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          parameters: Json | null
          query_text: string
          query_type: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by: string
          default_format?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          parameters?: Json | null
          query_text: string
          query_type?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string
          default_format?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          parameters?: Json | null
          query_text?: string
          query_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "query_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          base_quantity: number | null
          batch_id: string
          company_id: string | null
          created_at: string
          deleted: boolean
          device_id: string | null
          discount_percentage: number
          free_quantity: number
          gst_percentage: number
          id: string
          product_id: string
          quantity: number
          sales_order_id: string
          sold_unit: string | null
          total_price: number
          unit_price: number
          updated_at: string
          version: number
        }
        Insert: {
          base_quantity?: number | null
          batch_id: string
          company_id?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          discount_percentage?: number
          free_quantity?: number
          gst_percentage: number
          id?: string
          product_id: string
          quantity: number
          sales_order_id: string
          sold_unit?: string | null
          total_price: number
          unit_price: number
          updated_at?: string
          version?: number
        }
        Update: {
          base_quantity?: number | null
          batch_id?: string
          company_id?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          discount_percentage?: number
          free_quantity?: number
          gst_percentage?: number
          id?: string
          product_id?: string
          quantity?: number
          sales_order_id?: string
          sold_unit?: string | null
          total_price?: number
          unit_price?: number
          updated_at?: string
          version?: number
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
          automation_payload: Json
          automation_source: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          credit_period_days: number | null
          customer_address: string | null
          customer_gstin: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deleted: boolean
          delivery_charges: number
          device_id: string | null
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
          ledger_id: string | null
          notes: string | null
          other_charges: number
          payment_method: string | null
          payment_status: string
          prescription_date: string | null
          prescription_duration_days: number | null
          prescription_image_url: string | null
          prescription_number: string | null
          reminder_enabled: boolean
          sale_date: string
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
          version: number
        }
        Insert: {
          amount_paid?: number
          automation_payload?: Json
          automation_source?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_period_days?: number | null
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          deleted?: boolean
          delivery_charges?: number
          device_id?: string | null
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
          ledger_id?: string | null
          notes?: string | null
          other_charges?: number
          payment_method?: string | null
          payment_status?: string
          prescription_date?: string | null
          prescription_duration_days?: number | null
          prescription_image_url?: string | null
          prescription_number?: string | null
          reminder_enabled?: boolean
          sale_date?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
          version?: number
        }
        Update: {
          amount_paid?: number
          automation_payload?: Json
          automation_source?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_period_days?: number | null
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deleted?: boolean
          delivery_charges?: number
          device_id?: string | null
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
          ledger_id?: string | null
          notes?: string | null
          other_charges?: number
          payment_method?: string | null
          payment_status?: string
          prescription_date?: string | null
          prescription_duration_days?: number | null
          prescription_image_url?: string | null
          prescription_number?: string | null
          reminder_enabled?: boolean
          sale_date?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
          version?: number
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
            foreignKeyName: "sales_orders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers_with_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "party_transaction_history"
            referencedColumns: ["ledger_id"]
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
      staging_batches: {
        Row: {
          batch_number: string | null
          company_id: string
          created_at: string | null
          expiry_date: string | null
          godown_name: string | null
          id: string
          manufacturing_date: string | null
          mapped_product_id: string | null
          mapped_supplier_id: string | null
          mrp: number | null
          product_name: string
          purchase_price: number | null
          quantity: number | null
          resolved: boolean | null
          row_index: number
          session_id: string
          source_data: Json | null
          supplier_name: string | null
          validation_errors: Json | null
          validation_status: string | null
        }
        Insert: {
          batch_number?: string | null
          company_id: string
          created_at?: string | null
          expiry_date?: string | null
          godown_name?: string | null
          id?: string
          manufacturing_date?: string | null
          mapped_product_id?: string | null
          mapped_supplier_id?: string | null
          mrp?: number | null
          product_name: string
          purchase_price?: number | null
          quantity?: number | null
          resolved?: boolean | null
          row_index?: number
          session_id: string
          source_data?: Json | null
          supplier_name?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Update: {
          batch_number?: string | null
          company_id?: string
          created_at?: string | null
          expiry_date?: string | null
          godown_name?: string | null
          id?: string
          manufacturing_date?: string | null
          mapped_product_id?: string | null
          mapped_supplier_id?: string | null
          mrp?: number | null
          product_name?: string
          purchase_price?: number | null
          quantity?: number | null
          resolved?: boolean | null
          row_index?: number
          session_id?: string
          source_data?: Json | null
          supplier_name?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staging_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_batches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "import_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      staging_ledger_groups: {
        Row: {
          affects_stock: boolean | null
          company_id: string
          created_at: string | null
          group_type: string | null
          id: string
          level: number | null
          mapped_group_id: string | null
          materialized_path: string | null
          name: string
          parent_name: string | null
          resolved: boolean | null
          row_index: number
          session_id: string
          source_data: Json | null
          validation_errors: Json | null
          validation_status: string | null
        }
        Insert: {
          affects_stock?: boolean | null
          company_id: string
          created_at?: string | null
          group_type?: string | null
          id?: string
          level?: number | null
          mapped_group_id?: string | null
          materialized_path?: string | null
          name: string
          parent_name?: string | null
          resolved?: boolean | null
          row_index?: number
          session_id: string
          source_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Update: {
          affects_stock?: boolean | null
          company_id?: string
          created_at?: string | null
          group_type?: string | null
          id?: string
          level?: number | null
          mapped_group_id?: string | null
          materialized_path?: string | null
          name?: string
          parent_name?: string | null
          resolved?: boolean | null
          row_index?: number
          session_id?: string
          source_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staging_ledger_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_ledger_groups_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ledger_import_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      staging_ledgers: {
        Row: {
          address: string | null
          alias: string | null
          balance_type: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          city: string | null
          company_id: string
          contact_person: string | null
          country: string | null
          created_at: string | null
          email: string | null
          gst_number: string | null
          id: string
          ledger_code: string | null
          mapped_group_id: string | null
          mapped_ledger_id: string | null
          name: string
          opening_balance: number | null
          pan_number: string | null
          parent_group_name: string | null
          phone: string | null
          pincode: string | null
          resolved: boolean | null
          role_types: string[] | null
          row_index: number
          session_id: string
          source_data: Json | null
          state: string | null
          validation_errors: Json | null
          validation_status: string | null
        }
        Insert: {
          address?: string | null
          alias?: string | null
          balance_type?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          company_id: string
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          ledger_code?: string | null
          mapped_group_id?: string | null
          mapped_ledger_id?: string | null
          name: string
          opening_balance?: number | null
          pan_number?: string | null
          parent_group_name?: string | null
          phone?: string | null
          pincode?: string | null
          resolved?: boolean | null
          role_types?: string[] | null
          row_index?: number
          session_id: string
          source_data?: Json | null
          state?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Update: {
          address?: string | null
          alias?: string | null
          balance_type?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          company_id?: string
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          ledger_code?: string | null
          mapped_group_id?: string | null
          mapped_ledger_id?: string | null
          name?: string
          opening_balance?: number | null
          pan_number?: string | null
          parent_group_name?: string | null
          phone?: string | null
          pincode?: string | null
          resolved?: boolean | null
          role_types?: string[] | null
          row_index?: number
          session_id?: string
          source_data?: Json | null
          state?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staging_ledgers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_ledgers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ledger_import_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      staging_products: {
        Row: {
          category: string | null
          company_id: string
          composition: string | null
          created_at: string | null
          drug_schedule: string | null
          generic_name: string | null
          gst_percentage: number | null
          hsn_code: string | null
          id: string
          manufacturer_name: string | null
          mapped_manufacturer_id: string | null
          mrp: number | null
          name: string
          opening_balance: number | null
          opening_value: number | null
          purchase_price: number | null
          resolved: boolean | null
          row_index: number
          sale_price: number | null
          session_id: string
          source_data: Json | null
          strength: string | null
          unit: string | null
          validation_errors: Json | null
          validation_status: string | null
        }
        Insert: {
          category?: string | null
          company_id: string
          composition?: string | null
          created_at?: string | null
          drug_schedule?: string | null
          generic_name?: string | null
          gst_percentage?: number | null
          hsn_code?: string | null
          id?: string
          manufacturer_name?: string | null
          mapped_manufacturer_id?: string | null
          mrp?: number | null
          name: string
          opening_balance?: number | null
          opening_value?: number | null
          purchase_price?: number | null
          resolved?: boolean | null
          row_index?: number
          sale_price?: number | null
          session_id: string
          source_data?: Json | null
          strength?: string | null
          unit?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string
          composition?: string | null
          created_at?: string | null
          drug_schedule?: string | null
          generic_name?: string | null
          gst_percentage?: number | null
          hsn_code?: string | null
          id?: string
          manufacturer_name?: string | null
          mapped_manufacturer_id?: string | null
          mrp?: number | null
          name?: string
          opening_balance?: number | null
          opening_value?: number | null
          purchase_price?: number | null
          resolved?: boolean | null
          row_index?: number
          sale_price?: number | null
          session_id?: string
          source_data?: Json | null
          strength?: string | null
          unit?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staging_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_products_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "import_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      staging_suppliers: {
        Row: {
          address: string | null
          company_id: string
          contact_person: string | null
          created_at: string | null
          drug_license_number: string | null
          email: string | null
          gst_number: string | null
          id: string
          name: string
          pan_number: string | null
          parent_group_name: string | null
          phone: string | null
          resolved: boolean | null
          row_index: number
          session_id: string
          source_data: Json | null
          state: string | null
          validation_errors: Json | null
          validation_status: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          contact_person?: string | null
          created_at?: string | null
          drug_license_number?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          pan_number?: string | null
          parent_group_name?: string | null
          phone?: string | null
          resolved?: boolean | null
          row_index?: number
          session_id: string
          source_data?: Json | null
          state?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          contact_person?: string | null
          created_at?: string | null
          drug_license_number?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          pan_number?: string | null
          parent_group_name?: string | null
          phone?: string | null
          resolved?: boolean | null
          row_index?: number
          session_id?: string
          source_data?: Json | null
          state?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staging_suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_suppliers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "import_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_formats: {
        Row: {
          column_coordinates: Json | null
          column_mappings: Json | null
          company_id: string | null
          created_at: string | null
          format_type: string
          id: string
          learned_offsets: Json | null
          row_detection_pattern: string | null
          supplier_id: string | null
          template_version: number | null
          total_scanned: number | null
          updated_at: string | null
        }
        Insert: {
          column_coordinates?: Json | null
          column_mappings?: Json | null
          company_id?: string | null
          created_at?: string | null
          format_type?: string
          id?: string
          learned_offsets?: Json | null
          row_detection_pattern?: string | null
          supplier_id?: string | null
          template_version?: number | null
          total_scanned?: number | null
          updated_at?: string | null
        }
        Update: {
          column_coordinates?: Json | null
          column_mappings?: Json | null
          company_id?: string | null
          created_at?: string | null
          format_type?: string
          id?: string
          learned_offsets?: Json | null
          row_detection_pattern?: string | null
          supplier_id?: string | null
          template_version?: number | null
          total_scanned?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_formats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_formats_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          deleted: boolean
          device_id: string | null
          drug_license_number: string | null
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
          version: number
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          drug_license_number?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          address?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          drug_license_number?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_suppliers_company_id"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_conversions: {
        Row: {
          conversion_factor: number
          created_at: string
          from_unit: string
          id: string
          to_unit: string
        }
        Insert: {
          conversion_factor: number
          created_at?: string
          from_unit: string
          id?: string
          to_unit: string
        }
        Update: {
          conversion_factor?: number
          created_at?: string
          from_unit?: string
          id?: string
          to_unit?: string
        }
        Relationships: []
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
      unit_master: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          unit_code: string
          unit_name: string
          unit_type: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          unit_code: string
          unit_name: string
          unit_type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          unit_code?: string
          unit_name?: string
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_master_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_companies_company_id_fkey"
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
      vendor_product_aliases: {
        Row: {
          approval_history: Json | null
          approved_by: string | null
          confidence_score: number | null
          created_at: string
          embedding: string | null
          id: string
          is_approved: boolean | null
          last_match_confidence: number | null
          last_matched_at: string | null
          last_used_at: string | null
          match_count: number | null
          match_history: Json | null
          normalized_name: string
          product_id: string
          supplier_id: string
          updated_at: string
          usage_count: number | null
          vendor_product_name: string
        }
        Insert: {
          approval_history?: Json | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          embedding?: string | null
          id?: string
          is_approved?: boolean | null
          last_match_confidence?: number | null
          last_matched_at?: string | null
          last_used_at?: string | null
          match_count?: number | null
          match_history?: Json | null
          normalized_name: string
          product_id: string
          supplier_id: string
          updated_at?: string
          usage_count?: number | null
          vendor_product_name: string
        }
        Update: {
          approval_history?: Json | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          embedding?: string | null
          id?: string
          is_approved?: boolean | null
          last_match_confidence?: number | null
          last_matched_at?: string | null
          last_used_at?: string | null
          match_count?: number | null
          match_history?: Json | null
          normalized_name?: string
          product_id?: string
          supplier_id?: string
          updated_at?: string
          usage_count?: number | null
          vendor_product_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_product_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_product_aliases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          template_key: string
          updated_at: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          template_key: string
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ledger_balances_with_names: {
        Row: {
          alias: string | null
          balance_type: Database["public"]["Enums"]["balance_type"] | null
          closing_balance: number | null
          closing_balance_type:
            | Database["public"]["Enums"]["balance_type"]
            | null
          company_id: string | null
          current_balance: number | null
          financial_year: string | null
          group_name: string | null
          group_type: Database["public"]["Enums"]["ledger_group_type"] | null
          id: string | null
          ledger_code: string | null
          name: string | null
          opening_balance: number | null
          roles: string[] | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledgers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transaction_history: {
        Row: {
          created_at: string | null
          credit: number | null
          date: string | null
          debit: number | null
          ledger_id: string | null
          narration: string | null
          ref_number: string | null
          ref_type: Database["public"]["Enums"]["journal_reference_type"] | null
          voucher_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_voucher_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_balances_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledgers_with_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_voucher_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "party_transaction_history"
            referencedColumns: ["ledger_id"]
          },
        ]
      }
      ledgers_with_roles: {
        Row: {
          address: Json | null
          alias: string | null
          balance_type: Database["public"]["Enums"]["balance_type"] | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          billing_address: Json | null
          city: string | null
          company_id: string | null
          contact_person: string | null
          country: string | null
          created_at: string | null
          current_balance: number | null
          email: string | null
          gst_number: string | null
          gst_registration_type: string | null
          id: string | null
          import_metadata: Json | null
          is_active: boolean | null
          ledger_code: string | null
          ledger_group_id: string | null
          mobile: string | null
          name: string | null
          opening_balance: number | null
          pan_number: string | null
          party_type: string | null
          phone: string | null
          pincode: string | null
          primary_role: Database["public"]["Enums"]["ledger_role_type"] | null
          roles: Database["public"]["Enums"]["ledger_role_type"][] | null
          shipping_address: Json | null
          source_group_name: string | null
          source_ledger_name: string | null
          source_system: string | null
          state: string | null
          tax_id: string | null
          updated_at: string | null
          website: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledgers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledgers_ledger_group_id_fkey"
            columns: ["ledger_group_id"]
            isOneToOne: false
            referencedRelation: "ledger_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      party_transaction_history: {
        Row: {
          created_at: string | null
          credit: number | null
          date: string | null
          debit: number | null
          ledger_current_balance: number | null
          ledger_id: string | null
          narration: string | null
          party_name: string | null
          ref_number: string | null
          ref_type: Database["public"]["Enums"]["journal_reference_type"] | null
          reference_id: string | null
          voucher_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_user_to_company: {
        Args: {
          _company_id: string
          _role?: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      allocate_batches_fifo:
        | {
            Args: {
              _company_id: string
              _exclude_batch_quantities?: Json
              _product_id: string
              _requested_quantity: number
            }
            Returns: Json
          }
        | {
            Args: {
              _company_id: string
              _exclude_batch_quantities?: Json
              _product_id: string
              _requested_quantity: number
            }
            Returns: Json
          }
      backfill_company_ledger_entries: {
        Args: { p_company_id: string }
        Returns: Json
      }
      batch_match_products: {
        Args: {
          _company_id: string
          _embeddings?: Json
          _line_items: Json
          _supplier_id?: string
        }
        Returns: Json
      }
      bulk_merge_duplicate_ledgers: {
        Args: {
          p_company_id: string
          p_dry_run?: boolean
          p_merged_by?: string
        }
        Returns: {
          canonical_name: string
          kept_ledger_id: string
          kept_ledger_name: string
          merged_ledger_id: string
          merged_ledger_name: string
          orders_updated: number
          payments_updated: number
          status: string
          transactions_moved: number
        }[]
      }
      claim_next_scan_job: { Args: never; Returns: Json }
      close_financial_year: {
        Args: { p_company_id: string; p_financial_year: string }
        Returns: {
          closing_balance: number
          closing_balance_type: string
          ledger_id: string
          name: string
        }[]
      }
      complete_onboarding: {
        Args: { _business_type: string; _company_name: string }
        Returns: string
      }
      compute_hybrid_match_score: {
        Args: {
          _candidate_product: Json
          _parsed_invoice: Json
          _vector_similarity?: number
        }
        Returns: number
      }
      cosine_distance_to_confidence: {
        Args: { distance: number }
        Returns: number
      }
      create_ledger_roles_from_staging: {
        Args: {
          p_company_id: string
          p_ledger_id: string
          p_role_types: string[]
        }
        Returns: undefined
      }
      deduct_batch_quantity:
        | { Args: { _batch_id: string; _quantity: number }; Returns: number }
        | { Args: { _batch_id: string; _quantity: number }; Returns: number }
      deduct_mixed_stock:
        | { Args: { _base_quantity: number; _batch_id: string }; Returns: Json }
        | { Args: { _base_quantity: number; _batch_id: string }; Returns: Json }
      deduct_sale_inventory: { Args: { _items: Json }; Returns: Json }
      dispose_expired_batch: {
        Args: { _batch_id: string; _notes?: string; _quantity: number }
        Returns: Json
      }
      execute_readonly_query: {
        Args: { max_rows?: number; query_sql: string }
        Returns: Json
      }
      find_best_product_match: {
        Args: {
          company_id: string
          extracted_name: string
          query_embedding?: string
          supplier_id?: string
        }
        Returns: {
          confidence_score: number
          matching_method: string
          product_id: string
          product_name: string
        }[]
      }
      find_duplicate_ledgers: {
        Args: { p_company_id: string }
        Returns: {
          canonical_name: string
          duplicate_count: number
          ledger_ids: string[]
          total_credit: number
          total_debit: number
        }[]
      }
      generate_product_fingerprint: {
        Args: {
          brand?: string
          form?: string
          pack_size?: string
          strength?: string
        }
        Returns: string
      }
      get_alias_reliability: { Args: { _supplier_id: string }; Returns: number }
      get_current_financial_year: {
        Args: { _company_id: string }
        Returns: string
      }
      get_financial_year: { Args: { p_date: string }; Returns: string }
      get_fy_name: { Args: { _date: string }; Returns: string }
      get_ledger_group_ancestors: {
        Args: { p_group_id: string }
        Returns: {
          id: string
        }[]
      }
      get_ledger_group_descendants: {
        Args: { p_group_id: string }
        Returns: {
          id: string
        }[]
      }
      get_ledger_transactions: {
        Args: {
          p_ledger_id: string
          p_limit?: number
          p_offset?: number
          p_year?: string
        }
        Returns: {
          credit: number
          date: string
          debit: number
          narration: string
          ref_number: string
          ref_type: string
          running_balance: number
          voucher_id: string
        }[]
      }
      get_next_invoice_number: {
        Args: { _company_id: string; _prefix?: string }
        Returns: string
      }
      get_or_create_system_ledger: {
        Args: {
          p_company_id: string
          p_group_name: string
          p_ledger_name: string
          p_role_type?: string
        }
        Returns: string
      }
      get_party_transactions: {
        Args: {
          p_ledger_id: string
          p_limit?: number
          p_offset?: number
          p_year?: string
        }
        Returns: {
          credit: number
          date: string
          debit: number
          narration: string
          ref_number: string
          ref_type: string
          running_balance: number
          voucher_id: string
        }[]
      }
      get_user_company_id:
        | { Args: never; Returns: string }
        | { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      learn_column_mapping: {
        Args: {
          _confidence?: number
          _detected_column: string
          _field_name: string
          _format_type: string
          _supplier_id: string
        }
        Returns: undefined
      }
      merge_ledgers: {
        Args: {
          p_company_id: string
          p_merged_by?: string
          p_source_ledger_id: string
          p_target_ledger_id: string
        }
        Returns: {
          balance_transferred: number
          orders_updated: number
          payments_updated: number
          roles_merged: number
          source_name: string
          target_name: string
          transactions_moved: number
        }[]
      }
      normalize_product_text: { Args: { input_text: string }; Returns: string }
      parse_product_text: { Args: { input_text: string }; Returns: Json }
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
      reconcile_inventory_ledger: {
        Args: { p_apply?: boolean; p_company_id: string }
        Returns: {
          applied: boolean
          batch_id: string
          batch_number: string
          diff: number
          ledger_qty: number
          product_id: string
          stored_qty: number
        }[]
      }
      record_alias_match: {
        Args: {
          _confidence: number
          _extracted_name?: string
          _supplier_id: string
          _vendor_product_name: string
        }
        Returns: undefined
      }
      resolve_conversion: {
        Args: {
          _batch_id: string
          _company_id: string
          _from_unit: string
          _product_id: string
          _to_unit: string
        }
        Returns: Json
      }
      resolve_party_ledger: {
        Args: {
          p_company_id: string
          p_party_name: string
          p_party_type: string
        }
        Returns: string
      }
      restore_sale_inventory: { Args: { _items: Json }; Returns: undefined }
      retry_failed_scans: { Args: { _company_id?: string }; Returns: number }
      review_alias: {
        Args: {
          _alias_id: string
          _approved: boolean
          _notes?: string
          _reviewed_by: string
        }
        Returns: undefined
      }
      seed_default_ledger_groups: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      suggest_column_mappings: {
        Args: { _format_type?: string; _supplier_id: string }
        Returns: Json
      }
      switch_active_company: {
        Args: { _company_id: string }
        Returns: undefined
      }
      text_similarity: {
        Args: { text1: string; text2: string }
        Returns: number
      }
      trial_balance: {
        Args: { p_company_id: string; p_financial_year: string }
        Returns: {
          group_name: string
          group_type: string
          total_credit: number
          total_debit: number
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_scan_job: {
        Args: {
          _error?: string
          _job_id: string
          _result?: Json
          _stage?: string
          _stage_progress?: number
          _status: string
        }
        Returns: undefined
      }
      user_has_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "pharmacist" | "staff" | "super_admin"
      balance_type: "debit" | "credit"
      drug_schedule:
        | "none"
        | "schedule_h"
        | "schedule_h1"
        | "schedule_x"
        | "narcotic"
      fy_status: "active" | "closed" | "archived"
      journal_reference_type:
        | "sales_order"
        | "purchase_order"
        | "payment"
        | "adjustment"
      ledger_group_type:
        | "assets"
        | "liabilities"
        | "income"
        | "expenses"
        | "capital"
        | "bank"
        | "cash"
        | "tax"
        | "sundry_debtors"
        | "sundry_creditors"
        | "loan"
        | "investment"
        | "other"
      ledger_role_type:
        | "customer"
        | "supplier"
        | "manufacturer"
        | "distributor"
        | "employee"
        | "doctor"
        | "bank"
        | "tax"
        | "expense"
        | "income"
        | "asset"
        | "liability"
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
      balance_type: ["debit", "credit"],
      drug_schedule: [
        "none",
        "schedule_h",
        "schedule_h1",
        "schedule_x",
        "narcotic",
      ],
      fy_status: ["active", "closed", "archived"],
      journal_reference_type: [
        "sales_order",
        "purchase_order",
        "payment",
        "adjustment",
      ],
      ledger_group_type: [
        "assets",
        "liabilities",
        "income",
        "expenses",
        "capital",
        "bank",
        "cash",
        "tax",
        "sundry_debtors",
        "sundry_creditors",
        "loan",
        "investment",
        "other",
      ],
      ledger_role_type: [
        "customer",
        "supplier",
        "manufacturer",
        "distributor",
        "employee",
        "doctor",
        "bank",
        "tax",
        "expense",
        "income",
        "asset",
        "liability",
      ],
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
