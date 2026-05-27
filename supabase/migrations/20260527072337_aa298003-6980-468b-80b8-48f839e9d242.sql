DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.get_inbox_items(integer)'::regprocedure) INTO v_def;

  v_def := replace(
    v_def,
    'WHERE item_key NOT IN (SELECT item_key FROM dismissed)',
    'WHERE all_items.item_key NOT IN (SELECT d.item_key FROM dismissed d)'
  );

  v_def := replace(
    v_def,
    'CASE severity WHEN ''high'' THEN 0 WHEN ''medium'' THEN 1 ELSE 2 END,',
    'CASE all_items.severity WHEN ''high'' THEN 0 WHEN ''medium'' THEN 1 ELSE 2 END,'
  );

  v_def := replace(
    v_def,
    'created_at DESC',
    'all_items.created_at DESC'
  );

  EXECUTE v_def;
END $$;