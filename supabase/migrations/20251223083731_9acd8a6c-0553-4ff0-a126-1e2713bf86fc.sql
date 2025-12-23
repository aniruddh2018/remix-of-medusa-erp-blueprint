-- Add PERMISSIVE policies for staff to create products and suppliers
-- Note: Current restrictive policies only allow admin/pharmacist

-- Allow staff to insert products
CREATE POLICY "Staff can create products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow staff to update products
CREATE POLICY "Staff can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (true);

-- Allow staff to insert suppliers
CREATE POLICY "Staff can create suppliers"
ON public.suppliers
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow staff to update suppliers
CREATE POLICY "Staff can update suppliers"
ON public.suppliers
FOR UPDATE
TO authenticated
USING (true);