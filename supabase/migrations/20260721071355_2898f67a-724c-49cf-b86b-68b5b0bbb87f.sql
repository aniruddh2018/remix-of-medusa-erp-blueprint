-- 1. Fix products with non-atomic base_unit on tablet-like forms.
--    Map the wrong base to the correct atomic unit per form.
WITH mapping AS (
  SELECT * FROM (VALUES
    ('TABLET',   'TAB'),
    ('CAPSULE',  'CAP'),
    ('INJECTION','VIAL'),
    ('SYRUP',    'BOTTLE'),
    ('CREAM',    'TUBE'),
    ('POWDER',   'SACHET')
  ) AS m(form, atomic)
)
UPDATE public.products p
SET base_unit = m.atomic,
    unit = CASE WHEN p.unit IS NULL OR upper(p.unit) IN ('STRIP','BOX','PACK','CTN','CARTON','CASE')
                THEN m.atomic ELSE p.unit END
FROM mapping m
WHERE upper(coalesce(p.form,'')) = m.form
  AND upper(coalesce(p.base_unit,'')) IN ('STRIP','BOX','PACK','CTN','CARTON','CASE');

-- 2. Flip reversed conversion rows: rows where to_unit is the pack unit
--    and from_unit is the atomic unit should be swapped so
--    from_unit = STRIP/BOX (pack) and to_unit = TAB/CAP/VIAL/... (atomic).
UPDATE public.product_conversions c
SET from_unit = c.to_unit,
    to_unit   = c.from_unit
WHERE upper(c.to_unit)   IN ('STRIP','BOX','PACK','CTN','CARTON','CASE')
  AND upper(c.from_unit) IN ('TAB','CAP','VIAL','BOTTLE','TUBE','SACHET','ML','GM','MG');
