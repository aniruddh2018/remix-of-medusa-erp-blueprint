-- Database Schema for ERP System
-- Generated: 2026-04-16
-- This file documents the current table structures and constraints

-- ===========================================
-- COMPANIES TABLE
-- ===========================================
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gst_number text,
  address text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- SALES ORDERS TABLE
-- ===========================================
CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  customer_address text,
  prescription_number text,
  status order_status NOT NULL DEFAULT 'confirmed',
  total_amount decimal(12,2) NOT NULL DEFAULT 0,
  gst_amount decimal(12,2) NOT NULL DEFAULT 0,
  discount_amount decimal(12,2) NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'cash',
  notes text,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id),
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Constraints
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_company_invoice_unique UNIQUE (company_id, invoice_number);

-- ===========================================
-- SALES ORDER ITEMS TABLE
-- ===========================================
CREATE TABLE public.sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid REFERENCES public.inventory_batches(id),
  product_name text NOT NULL,
  batch_number text,
  quantity integer NOT NULL,
  unit_price decimal(12,2) NOT NULL,
  gst_percentage decimal(5,2) NOT NULL DEFAULT 0,
  discount_percentage decimal(5,2) NOT NULL DEFAULT 0,
  total_price decimal(12,2) NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- PURCHASE ORDERS TABLE
-- ===========================================
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  challan_number text,
  invoice_number text,
  supplier_id uuid REFERENCES public.suppliers(id),
  status order_status NOT NULL DEFAULT 'pending',
  total_amount decimal(12,2) NOT NULL DEFAULT 0,
  gst_amount decimal(12,2) NOT NULL DEFAULT 0,
  discount_amount decimal(12,2) NOT NULL DEFAULT 0,
  notes text,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  delivery_date date,
  created_by uuid REFERENCES auth.users(id),
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Constraints
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_company_invoice_unique UNIQUE (company_id, invoice_number);

-- ===========================================
-- PURCHASE ORDER ITEMS TABLE
-- ===========================================
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name text NOT NULL,
  batch_number text,
  quantity integer NOT NULL,
  unit_price decimal(12,2) NOT NULL,
  gst_percentage decimal(5,2) NOT NULL DEFAULT 0,
  discount_percentage decimal(5,2) NOT NULL DEFAULT 0,
  total_price decimal(12,2) NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- PRODUCTS TABLE
-- ===========================================
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  generic_name text,
  strength text,
  dosage_form text,
  hsn_code text,
  gst_percentage decimal(5,2) NOT NULL DEFAULT 0,
  mrp decimal(10,2),
  purchase_price decimal(10,2),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- INVENTORY BATCHES TABLE
-- ===========================================
CREATE TABLE public.inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_number text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  purchase_price decimal(10,2),
  mrp decimal(10,2),
  expiry_date date,
  manufacturing_date date,
  supplier_id uuid REFERENCES public.suppliers(id),
  company_id uuid REFERENCES public.companies(id),
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- SUPPLIERS TABLE
-- ===========================================
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  gst_number text,
  is_active boolean NOT NULL DEFAULT true,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- CUSTOMERS TABLE
-- ===========================================
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  gst_number text,
  date_of_birth date,
  is_active boolean NOT NULL DEFAULT true,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- PAYMENTS TABLE
-- ===========================================
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_type payment_type NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  reference_number text NOT NULL,
  party_name text NOT NULL,
  party_type party_type NOT NULL,
  amount decimal(12,2) NOT NULL,
  payment_method text NOT NULL,
  payment_date date NOT NULL,
  cheque_number text,
  bank_name text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- CREDIT NOTES TABLE
-- ===========================================
CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text NOT NULL UNIQUE,
  original_invoice_id uuid REFERENCES public.sales_orders(id),
  original_invoice_number text,
  customer_name text NOT NULL,
  customer_phone text,
  reason text NOT NULL,
  notes text,
  total_amount decimal(12,2) NOT NULL,
  gst_amount decimal(12,2) NOT NULL,
  status credit_note_status NOT NULL DEFAULT 'issued',
  created_by uuid REFERENCES auth.users(id),
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- CREDIT NOTE ITEMS TABLE
-- ===========================================
CREATE TABLE public.credit_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid REFERENCES public.inventory_batches(id),
  product_name text NOT NULL,
  batch_number text,
  quantity integer NOT NULL,
  unit_price decimal(12,2) NOT NULL,
  gst_percentage decimal(5,2) NOT NULL DEFAULT 0,
  discount_percentage decimal(5,2) NOT NULL DEFAULT 0,
  total_price decimal(12,2) NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- DEBIT NOTES TABLE
-- ===========================================
CREATE TABLE public.debit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_number text NOT NULL UNIQUE,
  original_order_id uuid REFERENCES public.purchase_orders(id),
  original_order_number text,
  supplier_id uuid REFERENCES public.suppliers(id),
  supplier_name text,
  reason text NOT NULL,
  notes text,
  total_amount decimal(12,2) NOT NULL,
  gst_amount decimal(12,2) NOT NULL DEFAULT 0,
  status debit_note_status NOT NULL DEFAULT 'issued',
  created_by uuid REFERENCES auth.users(id),
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- DEBIT NOTE ITEMS TABLE
-- ===========================================
CREATE TABLE public.debit_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id uuid NOT NULL REFERENCES public.debit_notes(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid,
  product_name text NOT NULL,
  batch_number text,
  quantity integer NOT NULL,
  unit_price decimal(12,2) NOT NULL,
  gst_percentage decimal(5,2) NOT NULL DEFAULT 0,
  discount_percentage decimal(5,2) NOT NULL DEFAULT 0,
  total_price decimal(12,2) NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- INVOICE SEQUENCES TABLE (for sequential numbering)
-- ===========================================
CREATE TABLE public.invoice_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prefix text NOT NULL DEFAULT 'INV',
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, prefix, year)
);

-- ===========================================
-- ENUM TYPES
-- ===========================================
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'delivered', 'cancelled');
CREATE TYPE payment_type AS ENUM ('received', 'made');
CREATE TYPE party_type AS ENUM ('customer', 'supplier');
CREATE TYPE credit_note_status AS ENUM ('issued', 'cancelled');
CREATE TYPE debit_note_status AS ENUM ('issued', 'cancelled');

-- ===========================================
-- INDEXES
-- ===========================================
CREATE INDEX idx_sales_orders_invoice_number ON public.sales_orders(invoice_number);
CREATE INDEX idx_sales_orders_company_id ON public.sales_orders(company_id);
CREATE INDEX idx_sales_orders_sale_date ON public.sales_orders(sale_date);

CREATE INDEX idx_purchase_orders_order_number ON public.purchase_orders(order_number);
CREATE INDEX idx_purchase_orders_invoice_number ON public.purchase_orders(invoice_number);
CREATE INDEX idx_purchase_orders_company_id ON public.purchase_orders(company_id);

CREATE INDEX idx_inventory_batches_product_id ON public.inventory_batches(product_id);
CREATE INDEX idx_inventory_batches_company_id ON public.inventory_batches(company_id);
CREATE INDEX idx_inventory_batches_expiry_date ON public.inventory_batches(expiry_date);

CREATE INDEX idx_payments_reference_id ON public.payments(reference_id);
CREATE INDEX idx_payments_company_id ON public.payments(company_id);

-- ===========================================
-- ROW LEVEL SECURITY POLICIES
-- ===========================================
-- (Policies would be defined here, but omitted for brevity as they vary by user roles)

-- ===========================================
-- FUNCTIONS
-- ===========================================
-- get_next_invoice_number function is defined in migrations
-- allocate_batches_fifo function is defined in migrations
-- receive_purchase_batches function is defined in migrations