ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase'::text,
    'sale'::text,
    'sale_return'::text,
    'purchase_return'::text,
    'adjustment'::text,
    'opening'::text,
    'expiry_loss'::text
  ]));