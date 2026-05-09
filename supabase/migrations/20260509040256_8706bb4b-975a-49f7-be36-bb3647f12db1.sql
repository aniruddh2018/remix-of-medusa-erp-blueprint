CREATE OR REPLACE FUNCTION public.execute_readonly_query(query_sql text, max_rows integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT (query_sql ~* '^\s*SELECT') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  EXECUTE format('SELECT jsonb_agg(q.*) FROM (%s) q LIMIT %s', query_sql, max_rows)
  INTO result;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;