-- Backfill units, base_unit, form, product_conversions, inventory pack_size, and per-line units/base quantities.
-- Safe to re-run; only fills blanks.

CREATE OR REPLACE FUNCTION public.detect_product_form(_name text, _pack text)
RETURNS TABLE(form text, base_unit text, secondary_unit text, pack_factor numeric)
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n text := upper(coalesce(_name,'') || ' ' || coalesce(_pack,''));
  f text;
  bu text;
  su text;
  pf numeric := 1;
  m text[];
BEGIN
  IF n ~ '\yINJ' OR n ~ 'INJECTION' OR n ~ '\yVIAL' OR n ~ '\yAMP' THEN
    f := 'INJECTION'; bu := 'VIAL'; su := 'BOX';
  ELSIF n ~ '\yCAP' OR n ~ 'CAPSULE' THEN
    f := 'CAPSULE'; bu := 'CAP'; su := 'STRIP'; pf := 10;
  ELSIF n ~ '\yTAB' OR n ~ 'TABLET' THEN
    f := 'TABLET'; bu := 'TAB'; su := 'STRIP'; pf := 10;
  ELSIF n ~ 'SYRUP' OR n ~ '\ySYP' OR n ~ 'SUSP' OR n ~ '\yDROP' OR n ~ '\yLIQ' OR n ~ '\yML\y' OR n ~ '[0-9]ML' THEN
    f := 'SYRUP'; bu := 'BOTTLE'; su := 'BOX';
  ELSIF n ~ 'CREAM' OR n ~ '\yOINT' OR n ~ '\yGEL' OR n ~ 'LOTION' THEN
    f := 'CREAM'; bu := 'TUBE'; su := 'BOX';
  ELSIF n ~ 'POWDER' OR n ~ 'SACHET' OR n ~ '\yPWD' THEN
    f := 'POWDER'; bu := 'SACHET'; su := 'BOX';
  ELSE
    f := NULL; bu := 'PCS'; su := NULL;
  END IF;

  -- Parse pack: "10*10" -> 10, "1*10" -> 10, "10'S" -> 10, "100ML" -> 1
  IF _pack IS NOT NULL AND _pack <> '' THEN
    m := regexp_match(upper(_pack), '([0-9]+)\s*[\*Xx]\s*([0-9]+)');
    IF m IS NOT NULL THEN
      pf := GREATEST((m[1])::numeric, (m[2])::numeric);
    ELSE
      m := regexp_match(upper(_pack), '([0-9]+)\s*''?S');
      IF m IS NOT NULL THEN pf := (m[1])::numeric; END IF;
    END IF;
  END IF;

  IF pf IS NULL OR pf <= 0 THEN pf := 1; END IF;
  RETURN QUERY SELECT f, bu, su, pf;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_units_conversions(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_products_updated int := 0;
  v_conv_inserted int := 0;
  v_batches_updated int := 0;
  v_poi_updated int := 0;
  v_soi_updated int := 0;
BEGIN
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
  END IF;

  -- 1) Products: fill form + base_unit where blank
  WITH candidates AS (
    SELECT p.id, p.name, p.pack_size, p.form, p.base_unit, p.unit, d.form AS d_form, d.base_unit AS d_base, d.secondary_unit AS d_sec, d.pack_factor AS d_pf
    FROM products p
    CROSS JOIN LATERAL public.detect_product_form(p.name, p.pack_size) d
    WHERE p.company_id = _company_id
      AND (p.form IS NULL OR p.form = '' OR p.base_unit IS NULL OR p.base_unit = '')
  ), upd AS (
    UPDATE products p SET
      form = COALESCE(NULLIF(p.form,''), c.d_form),
      base_unit = COALESCE(NULLIF(p.base_unit,''), c.d_base),
      unit = COALESCE(NULLIF(p.unit,''), c.d_base)
    FROM candidates c
    WHERE p.id = c.id
    RETURNING p.id
  )
  SELECT count(*) INTO v_products_updated FROM upd;

  -- 2) product_conversions: insert secondary->base where product has none
  WITH need AS (
    SELECT p.id AS product_id, p.base_unit, d.secondary_unit, d.pack_factor
    FROM products p
    CROSS JOIN LATERAL public.detect_product_form(p.name, p.pack_size) d
    WHERE p.company_id = _company_id
      AND d.secondary_unit IS NOT NULL
      AND d.pack_factor > 1
      AND p.base_unit IS NOT NULL AND p.base_unit <> ''
      AND upper(d.secondary_unit) <> upper(p.base_unit)
      AND NOT EXISTS (SELECT 1 FROM product_conversions pc WHERE pc.product_id = p.id)
  ), ins AS (
    INSERT INTO product_conversions (company_id, product_id, from_unit, to_unit, conversion_factor, is_active)
    SELECT _company_id, product_id, secondary_unit, base_unit, pack_factor, true FROM need
    RETURNING id
  )
  SELECT count(*) INTO v_conv_inserted FROM ins;

  -- 3) inventory_batches: fill pack_size from product_conversions where null/0
  WITH upd AS (
    UPDATE inventory_batches b SET
      pack_size = pc.conversion_factor
    FROM product_conversions pc
    WHERE b.product_id = pc.product_id
      AND pc.is_active = true
      AND b.company_id = _company_id
      AND (b.pack_size IS NULL OR b.pack_size = 0)
    RETURNING b.id
  )
  SELECT count(*) INTO v_batches_updated FROM upd;

  -- 4) purchase_order_items: fill purchased_unit (from product.base_unit) and base_quantity where blank
  WITH upd AS (
    UPDATE purchase_order_items poi SET
      purchased_unit = COALESCE(NULLIF(poi.purchased_unit,''), p.base_unit, p.unit, 'PCS'),
      base_quantity = COALESCE(poi.base_quantity, poi.quantity::numeric)
    FROM products p
    WHERE poi.product_id = p.id
      AND poi.company_id = _company_id
      AND (poi.purchased_unit IS NULL OR poi.purchased_unit = '' OR poi.base_quantity IS NULL)
    RETURNING poi.id
  )
  SELECT count(*) INTO v_poi_updated FROM upd;

  -- 5) sales_order_items: same treatment
  WITH upd AS (
    UPDATE sales_order_items soi SET
      sold_unit = COALESCE(NULLIF(soi.sold_unit,''), p.base_unit, p.unit, 'PCS'),
      base_quantity = COALESCE(soi.base_quantity, soi.quantity::numeric)
    FROM products p
    WHERE soi.product_id = p.id
      AND soi.company_id = _company_id
      AND (soi.sold_unit IS NULL OR soi.sold_unit = '' OR soi.base_quantity IS NULL)
    RETURNING soi.id
  )
  SELECT count(*) INTO v_soi_updated FROM upd;

  RETURN jsonb_build_object(
    'products_updated', v_products_updated,
    'conversions_inserted', v_conv_inserted,
    'batches_updated', v_batches_updated,
    'purchase_items_updated', v_poi_updated,
    'sales_items_updated', v_soi_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_units_conversions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_units_conversions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_product_form(text, text) TO authenticated;