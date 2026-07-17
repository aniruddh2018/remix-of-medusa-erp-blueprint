UPDATE public.purchase_orders
SET is_challan = false,
    invoice_number = COALESCE(invoice_number, supplier_invoice_number, order_number)
WHERE company_id = 'f63b7c95-fb63-4486-a669-a948ad76dcb5'
  AND is_challan = true
  AND supplier_invoice_number IS NOT NULL;