-- =========================================================================
-- UNIT CONVERSION SYSTEM
-- Integer-only factors. Sealed + loose quantity model. Per-batch overrides.
-- =========================================================================

-- 1. UNIT MASTER ----------------------------------------------------------
CREATE TABLE public.unit_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_name text NOT NULL,
  unit_code text NOT NULL,
  unit_type text NOT NULL DEFAULT 'discrete' CHECK (unit_type IN ('discrete','measurable')),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, unit_code)
);

CREATE INDEX idx_unit_master_company ON public.unit_master(company_id) WHERE company_id IS NOT NULL;

ALTER TABLE public.unit_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View units (own company or system)"
  ON public.unit_master FOR SELECT TO authenticated
  USING (is_system = true OR company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins manage own company units"
  ON public.unit_master FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Super admin manages system units"
  ON public.unit_master FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Seed common system units
INSERT INTO public.unit_master (unit_name, unit_code, unit_type, is_system) VALUES
  ('Tablet','tablet','discrete',true),
  ('Capsule','capsule','discrete',true),
  ('Strip','strip','discrete',true),
  ('Box','box','discrete',true),
  ('Bottle','bottle','discrete',true),
  ('Vial','vial','discrete',true),
  ('Piece','pcs','discrete',true),
  ('Milligram','mg','measurable',true),
  ('Gram','g','measurable',true),
  ('Microgram','mcg','measurable',true),
  ('Millilitre','ml','measurable',true),
  ('Litre','l','measurable',true);

-- 2. PRODUCT CONVERSIONS --------------------------------------------------
CREATE TABLE public.product_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  from_unit text NOT NULL,
  to_unit text NOT NULL,
  conversion_factor integer NOT NULL CHECK (conversion_factor > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, from_unit, to_unit)
);

CREATE INDEX idx_product_conv_product ON public.product_conversions(product_id) WHERE is_active;
CREATE INDEX idx_product_conv_company ON public.product_conversions(company_id);

ALTER TABLE public.product_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company product conversions"
  ON public.product_conversions FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Manage own company product conversions"
  ON public.product_conversions FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'pharmacist'::app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'pharmacist'::app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

-- 3. BATCH CONVERSIONS (override layer) -----------------------------------
CREATE TABLE public.batch_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
  from_unit text NOT NULL,
  to_unit text NOT NULL,
  conversion_factor integer NOT NULL CHECK (conversion_factor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, from_unit, to_unit)
);

CREATE INDEX idx_batch_conv_batch ON public.batch_conversions(batch_id);

ALTER TABLE public.batch_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company batch conversions"
  ON public.batch_conversions FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Manage own company batch conversions"
  ON public.batch_conversions FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'pharmacist'::app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'pharmacist'::app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

-- 4. SYSTEM CONVERSIONS (global fallbacks) --------------------------------
CREATE TABLE public.system_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_unit text NOT NULL,
  to_unit text NOT NULL,
  conversion_factor integer NOT NULL CHECK (conversion_factor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_unit, to_unit)
);

INSERT INTO public.system_conversions (from_unit, to_unit, conversion_factor) VALUES
  ('g','mg',1000),
  ('mg','mcg',1000),
  ('g','mcg',1000000),
  ('l','ml',1000);

ALTER TABLE public.system_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read system conversions"
  ON public.system_conversions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin manages system conversions"
  ON public.system_conversions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 5. CONVERSION AUDIT -----------------------------------------------------
CREATE TABLE public.conversion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  product_id uuid,
  batch_id uuid,
  from_unit text NOT NULL,
  to_unit text NOT NULL,
  conversion_factor integer NOT NULL,
  resolution_path text NOT NULL CHECK (resolution_path IN ('batch','product','system','identity')),
  reference_type text,
  reference_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_audit_company ON public.conversion_audit(company_id, created_at DESC);
CREATE INDEX idx_conv_audit_ref ON public.conversion_audit(reference_type, reference_id);

ALTER TABLE public.conversion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company conversion audit"
  ON public.conversion_audit FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Insert own company conversion audit"
  ON public.conversion_audit FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- 6. SCHEMA EXTENSIONS ----------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS base_unit text;

UPDATE public.products SET base_unit = unit WHERE base_unit IS NULL;

ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS loose_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pack_size integer;

-- pack_size = base units per sealed unit (strip), nullable when product is not packaged
ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS sold_unit text,
  ADD COLUMN IF NOT EXISTS base_quantity integer;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS purchased_unit text,
  ADD COLUMN IF NOT EXISTS base_quantity integer;

-- 7. CORE RPC: resolve_conversion ----------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_conversion(
  _company_id uuid,
  _product_id uuid,
  _batch_id uuid,
  _from_unit text,
  _to_unit text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _factor integer;
  _path text;
BEGIN
  IF _from_unit IS NULL OR _to_unit IS NULL THEN
    RAISE EXCEPTION 'from_unit and to_unit required';
  END IF;

  -- identity
  IF lower(_from_unit) = lower(_to_unit) THEN
    RETURN jsonb_build_object('factor',1,'path','identity','from',_from_unit,'to',_to_unit);
  END IF;

  -- 1. Batch override (forward)
  IF _batch_id IS NOT NULL THEN
    SELECT conversion_factor INTO _factor FROM batch_conversions
     WHERE batch_id = _batch_id AND lower(from_unit)=lower(_from_unit) AND lower(to_unit)=lower(_to_unit) LIMIT 1;
    IF _factor IS NOT NULL THEN
      RETURN jsonb_build_object('factor',_factor,'path','batch','from',_from_unit,'to',_to_unit);
    END IF;
    -- batch reverse
    SELECT conversion_factor INTO _factor FROM batch_conversions
     WHERE batch_id = _batch_id AND lower(from_unit)=lower(_to_unit) AND lower(to_unit)=lower(_from_unit) LIMIT 1;
    IF _factor IS NOT NULL THEN
      RETURN jsonb_build_object('factor',_factor,'path','batch','reverse',true,'from',_from_unit,'to',_to_unit);
    END IF;
  END IF;

  -- 2. Product conversion (forward)
  IF _product_id IS NOT NULL THEN
    SELECT conversion_factor INTO _factor FROM product_conversions
     WHERE product_id = _product_id AND is_active
       AND lower(from_unit)=lower(_from_unit) AND lower(to_unit)=lower(_to_unit) LIMIT 1;
    IF _factor IS NOT NULL THEN
      RETURN jsonb_build_object('factor',_factor,'path','product','from',_from_unit,'to',_to_unit);
    END IF;
    -- product reverse
    SELECT conversion_factor INTO _factor FROM product_conversions
     WHERE product_id = _product_id AND is_active
       AND lower(from_unit)=lower(_to_unit) AND lower(to_unit)=lower(_from_unit) LIMIT 1;
    IF _factor IS NOT NULL THEN
      RETURN jsonb_build_object('factor',_factor,'path','product','reverse',true,'from',_from_unit,'to',_to_unit);
    END IF;
  END IF;

  -- 3. System fallback (forward)
  SELECT conversion_factor INTO _factor FROM system_conversions
   WHERE lower(from_unit)=lower(_from_unit) AND lower(to_unit)=lower(_to_unit) LIMIT 1;
  IF _factor IS NOT NULL THEN
    RETURN jsonb_build_object('factor',_factor,'path','system','from',_from_unit,'to',_to_unit);
  END IF;
  -- system reverse
  SELECT conversion_factor INTO _factor FROM system_conversions
   WHERE lower(from_unit)=lower(_to_unit) AND lower(to_unit)=lower(_from_unit) LIMIT 1;
  IF _factor IS NOT NULL THEN
    RETURN jsonb_build_object('factor',_factor,'path','system','reverse',true,'from',_from_unit,'to',_to_unit);
  END IF;

  RAISE EXCEPTION 'No conversion found from % to %', _from_unit, _to_unit;
END;
$$;

-- 8. RPC: deduct_mixed_stock --------------------------------------------
-- Deducts base-unit quantity from a batch using sealed packs + loose split.
-- Breaks open sealed packs only when loose runs out.
CREATE OR REPLACE FUNCTION public.deduct_mixed_stock(
  _batch_id uuid,
  _base_quantity integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sealed integer;
  _loose integer;
  _pack integer;
  _company uuid;
  _caller_company uuid;
  _need integer := _base_quantity;
  _broken integer := 0;
BEGIN
  IF _base_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be > 0';
  END IF;

  _caller_company := public.get_user_company_id(auth.uid());
  IF _caller_company IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT quantity, loose_quantity, pack_size, company_id
    INTO _sealed, _loose, _pack, _company
  FROM inventory_batches WHERE id = _batch_id FOR UPDATE;

  IF _sealed IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF _company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
  END IF;

  -- Total available in base units
  IF (_loose + _sealed * COALESCE(_pack,1)) < _need THEN
    RAISE EXCEPTION 'Insufficient stock. Available % base units, requested %',
      _loose + _sealed * COALESCE(_pack,1), _need;
  END IF;

  -- Take from loose first
  IF _loose >= _need THEN
    _loose := _loose - _need;
    _need := 0;
  ELSE
    _need := _need - _loose;
    _loose := 0;
  END IF;

  -- Break open sealed packs as needed
  IF _need > 0 THEN
    IF COALESCE(_pack,0) <= 0 THEN
      -- No pack defined; treat sealed as base units 1:1
      _sealed := _sealed - _need;
      _need := 0;
    ELSE
      _broken := CEIL(_need::numeric / _pack)::integer;
      _sealed := _sealed - _broken;
      _loose := (_broken * _pack) - _need;  -- leftover from broken pack stays loose
      _need := 0;
    END IF;
  END IF;

  UPDATE inventory_batches
     SET quantity = _sealed, loose_quantity = _loose, updated_at = now()
   WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'batch_id', _batch_id,
    'sealed_remaining', _sealed,
    'loose_remaining', _loose,
    'packs_broken', _broken
  );
END;
$$;

-- 9. Triggers for updated_at ---------------------------------------------
CREATE TRIGGER trg_unit_master_updated BEFORE UPDATE ON public.unit_master
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_product_conv_updated BEFORE UPDATE ON public.product_conversions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_batch_conv_updated BEFORE UPDATE ON public.batch_conversions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();