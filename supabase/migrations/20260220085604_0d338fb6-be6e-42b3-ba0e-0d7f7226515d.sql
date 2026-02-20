
-- Credit Notes table (issued on sales returns - customer returns goods to pharmacy)
CREATE TABLE public.credit_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_note_number TEXT NOT NULL,
  original_invoice_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  original_invoice_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  reason TEXT NOT NULL,
  notes TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  gst_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Credit Note Items (the returned products)
CREATE TABLE public.credit_note_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_note_id UUID NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_id UUID REFERENCES public.inventory_batches(id),
  product_name TEXT NOT NULL,
  batch_number TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  gst_percentage NUMERIC NOT NULL DEFAULT 0,
  discount_percentage NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Debit Notes table (issued on purchase returns - pharmacy returns goods to supplier)
CREATE TABLE public.debit_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debit_note_number TEXT NOT NULL,
  original_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  original_order_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  supplier_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  gst_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Debit Note Items (the returned products)
CREATE TABLE public.debit_note_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debit_note_id UUID NOT NULL REFERENCES public.debit_notes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_id UUID REFERENCES public.inventory_batches(id),
  product_name TEXT NOT NULL,
  batch_number TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  gst_percentage NUMERIC NOT NULL DEFAULT 0,
  discount_percentage NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Timestamps triggers
CREATE TRIGGER update_credit_notes_updated_at
  BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_debit_notes_updated_at
  BEFORE UPDATE ON public.debit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for credit_notes
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view credit notes"
  ON public.credit_notes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create credit notes"
  ON public.credit_notes FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage credit notes"
  ON public.credit_notes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pharmacists can manage credit notes"
  ON public.credit_notes FOR ALL USING (has_role(auth.uid(), 'pharmacist'::app_role));

-- RLS for credit_note_items
ALTER TABLE public.credit_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view credit note items"
  ON public.credit_note_items FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create credit note items"
  ON public.credit_note_items FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage credit note items"
  ON public.credit_note_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pharmacists can manage credit note items"
  ON public.credit_note_items FOR ALL USING (has_role(auth.uid(), 'pharmacist'::app_role));

-- RLS for debit_notes
ALTER TABLE public.debit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view debit notes"
  ON public.debit_notes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create debit notes"
  ON public.debit_notes FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage debit notes"
  ON public.debit_notes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pharmacists can manage debit notes"
  ON public.debit_notes FOR ALL USING (has_role(auth.uid(), 'pharmacist'::app_role));

-- RLS for debit_note_items
ALTER TABLE public.debit_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view debit note items"
  ON public.debit_note_items FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create debit note items"
  ON public.debit_note_items FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage debit note items"
  ON public.debit_note_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pharmacists can manage debit note items"
  ON public.debit_note_items FOR ALL USING (has_role(auth.uid(), 'pharmacist'::app_role));
