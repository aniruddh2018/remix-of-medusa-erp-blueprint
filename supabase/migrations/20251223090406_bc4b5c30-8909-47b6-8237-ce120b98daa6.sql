-- Add PERMISSIVE INSERT policies for purchase orders and items
CREATE POLICY "Staff can create purchase orders"
ON public.purchase_orders
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Staff can update purchase orders"
ON public.purchase_orders
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Staff can create purchase order items"
ON public.purchase_order_items
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Staff can update purchase order items"
ON public.purchase_order_items
FOR UPDATE
TO authenticated
USING (true);

-- Add challan_number and invoice_number to purchase_orders
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS challan_number text,
ADD COLUMN IF NOT EXISTS invoice_number text,
ADD COLUMN IF NOT EXISTS is_challan boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS converted_from_challan_id uuid REFERENCES public.purchase_orders(id);

-- Create index for challan lookups
CREATE INDEX IF NOT EXISTS idx_purchase_orders_challan ON public.purchase_orders(challan_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_invoice ON public.purchase_orders(invoice_number);

-- Add sale_price to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sale_price numeric DEFAULT 0;