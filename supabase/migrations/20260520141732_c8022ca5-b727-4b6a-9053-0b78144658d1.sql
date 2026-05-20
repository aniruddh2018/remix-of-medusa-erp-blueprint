-- 1) Negative stock guard on inventory_batches
CREATE OR REPLACE FUNCTION public.guard_inventory_batches_nonnegative()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted IS DISTINCT FROM TRUE THEN
    IF NEW.quantity < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_STOCK: batch % quantity would become %', NEW.id, NEW.quantity
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.loose_quantity < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_STOCK: batch % loose_quantity would become %', NEW.id, NEW.loose_quantity
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_batches_nonnegative ON public.inventory_batches;
CREATE TRIGGER trg_inventory_batches_nonnegative
  BEFORE INSERT OR UPDATE ON public.inventory_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_inventory_batches_nonnegative();

-- 2) Reconcile inventory from the ledger
CREATE OR REPLACE FUNCTION public.reconcile_inventory_ledger(
  p_company_id uuid,
  p_apply boolean DEFAULT false
)
RETURNS TABLE (
  batch_id uuid,
  product_id uuid,
  batch_number text,
  stored_qty numeric,
  ledger_qty numeric,
  diff numeric,
  applied boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean;
  r record;
BEGIN
  -- Authorization: admin/pharmacist of this company, or super admin
  SELECT (
    (has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'pharmacist'::app_role))
      AND get_user_company_id(v_uid) = p_company_id
  ) OR is_super_admin(v_uid)
  INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR r IN
    SELECT
      b.id              AS batch_id,
      b.product_id      AS product_id,
      b.batch_number    AS batch_number,
      (COALESCE(b.quantity, 0) + COALESCE(b.loose_quantity, 0))::numeric AS stored_qty,
      COALESCE((
        SELECT SUM(t.quantity)
        FROM public.inventory_transactions t
        WHERE t.batch_id = b.id
          AND t.company_id = p_company_id
          AND COALESCE(t.deleted, false) = false
      ), 0)::numeric AS ledger_qty
    FROM public.inventory_batches b
    WHERE b.company_id = p_company_id
      AND COALESCE(b.deleted, false) = false
  LOOP
    IF r.ledger_qty <> r.stored_qty THEN
      IF p_apply THEN
        -- Adjustment transaction (delta to bring stored -> ledger is 0, but the
        -- correction itself is stored_qty - ledger_qty so the ledger stays self-consistent).
        INSERT INTO public.inventory_transactions (
          company_id, product_id, batch_id, transaction_type,
          quantity, rate, reference_type, notes, created_by
        ) VALUES (
          p_company_id, r.product_id, r.batch_id, 'adjustment',
          (r.ledger_qty - r.stored_qty), 0, 'reconciliation',
          'Auto reconciliation: stored=' || r.stored_qty || ' ledger=' || r.ledger_qty,
          v_uid
        );

        -- Force stored stock to match the ledger. Collapse to sealed-only.
        UPDATE public.inventory_batches
        SET quantity = GREATEST(r.ledger_qty, 0),
            loose_quantity = 0,
            updated_at = now(),
            version = COALESCE(version, 1) + 1
        WHERE id = r.batch_id;
      END IF;

      batch_id     := r.batch_id;
      product_id   := r.product_id;
      batch_number := r.batch_number;
      stored_qty   := r.stored_qty;
      ledger_qty   := r.ledger_qty;
      diff         := r.ledger_qty - r.stored_qty;
      applied      := p_apply;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_inventory_ledger(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_inventory_ledger(uuid, boolean) TO authenticated;