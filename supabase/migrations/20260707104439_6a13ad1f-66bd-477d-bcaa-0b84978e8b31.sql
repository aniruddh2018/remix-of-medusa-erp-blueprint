
-- 1. Extend invoice_sequences with a format template + padding hint
ALTER TABLE public.invoice_sequences
  ADD COLUMN IF NOT EXISTS format text,
  ADD COLUMN IF NOT EXISTS padding int NOT NULL DEFAULT 4;

COMMENT ON COLUMN public.invoice_sequences.format IS
  'Optional template. Tokens: {prefix}, {year}, {yy}, {seq}, {seqNN} (e.g. {seq04}=zero-padded to 4). When NULL, falls back to "{prefix}-{year}-{seq04}".';

-- 2. Format-aware next-number generator (backwards compatible)
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(_company_id uuid, _prefix text DEFAULT 'INV')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _year integer;
  _yy   text;
  _next integer;
  _format text;
  _padding int;
  _out text;
  _pad_match text;
  _pad_len int;
BEGIN
  _year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  _yy   := to_char(CURRENT_DATE, 'YY');

  INSERT INTO public.invoice_sequences (company_id, prefix, year, last_number)
  VALUES (_company_id, _prefix, _year, 1)
  ON CONFLICT (company_id, prefix, year)
  DO UPDATE SET last_number = invoice_sequences.last_number + 1, updated_at = now()
  RETURNING last_number, format, padding INTO _next, _format, _padding;

  IF _format IS NULL OR length(trim(_format)) = 0 THEN
    -- Legacy default
    RETURN _prefix || '-' || _year || '-' || LPAD(_next::text, GREATEST(_padding, 1), '0');
  END IF;

  _out := _format;
  _out := replace(_out, '{prefix}', _prefix);
  _out := replace(_out, '{year}', _year::text);
  _out := replace(_out, '{yy}', _yy);

  -- Handle {seqNN} width tokens (e.g. {seq04}, {seq6})
  _pad_match := (regexp_match(_out, '\{seq(\d+)\}'))[1];
  WHILE _pad_match IS NOT NULL LOOP
    _pad_len := _pad_match::int;
    _out := regexp_replace(_out, '\{seq' || _pad_match || '\}', LPAD(_next::text, _pad_len, '0'));
    _pad_match := (regexp_match(_out, '\{seq(\d+)\}'))[1];
  END LOOP;
  _out := replace(_out, '{seq}', _next::text);

  RETURN _out;
END;
$$;

-- 3. Seed the sequence from existing (MARG-imported) sales invoice numbers
CREATE OR REPLACE FUNCTION public.seed_invoice_sequence_from_history(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _year   integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  _rec    record;
  _sample text;
  _prefix text := '';
  _tail   text;
  _max    integer := 0;
  _pad    int := 4;
  _fmt    text;
  _has_slash boolean;
  _has_dash  boolean;
  _sample_head text;
  _row_count int := 0;
BEGIN
  -- Find the invoice with the highest numeric tail for this company
  FOR _rec IN
    SELECT invoice_number
    FROM public.sales_orders
    WHERE company_id = _company_id
      AND invoice_number IS NOT NULL
      AND invoice_number ~ '\d+$'
  LOOP
    _row_count := _row_count + 1;
    _tail := (regexp_match(_rec.invoice_number, '(\d+)$'))[1];
    IF _tail IS NOT NULL AND _tail::int > _max THEN
      _max := _tail::int;
      _sample := _rec.invoice_number;
      _pad := GREATEST(_pad, length(_tail));
    END IF;
  END LOOP;

  IF _sample IS NULL THEN
    RETURN jsonb_build_object(
      'seeded', false,
      'reason', 'no numeric invoice numbers found for company',
      'scanned_rows', _row_count
    );
  END IF;

  -- Split into prefix + numeric tail
  _prefix := regexp_replace(_sample, '\d+$', '');
  _sample_head := _prefix;

  -- Build a template from the sample. Replace the numeric tail with {seqNN}.
  _fmt := regexp_replace(_sample, '\d+$', '{seq' || LPAD(_pad::text, 2, '0') || '}');

  -- Normalise: if there's a year in the prefix, swap it to {year}/{yy}
  _fmt := regexp_replace(_fmt, '(\d{4})', '{year}', 'g');
  _fmt := regexp_replace(_fmt, '([^\d\{])(\d{2})([^\d\}])', '\1{yy}\3', 'g');

  -- Store under prefix key = literal non-digit head (may be '' for pure-number series)
  INSERT INTO public.invoice_sequences (company_id, prefix, year, last_number, format, padding)
  VALUES (_company_id, COALESCE(NULLIF(_prefix, ''), 'INV'), _year, _max, _fmt, _pad)
  ON CONFLICT (company_id, prefix, year)
  DO UPDATE SET
    last_number = GREATEST(invoice_sequences.last_number, EXCLUDED.last_number),
    format      = EXCLUDED.format,
    padding     = GREATEST(invoice_sequences.padding, EXCLUDED.padding),
    updated_at  = now();

  RETURN jsonb_build_object(
    'seeded', true,
    'prefix', COALESCE(NULLIF(_prefix, ''), 'INV'),
    'year', _year,
    'last_number', _max,
    'padding', _pad,
    'format', _fmt,
    'sample', _sample,
    'scanned_rows', _row_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_invoice_sequence_from_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_invoice_sequence_from_history(uuid) TO service_role;
