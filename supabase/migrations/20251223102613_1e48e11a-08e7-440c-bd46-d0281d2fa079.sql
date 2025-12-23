-- Add INSERT and UPDATE policies for staff on inventory_batches
CREATE POLICY "Staff can create batches" 
ON public.inventory_batches 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Staff can update batches" 
ON public.inventory_batches 
FOR UPDATE 
USING (true);