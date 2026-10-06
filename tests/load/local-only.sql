-- LOCAL DISPOSABLE DATABASE ONLY. Not a deployment migration.
-- Install manually after migrations. Never install on a shared/production database.
BEGIN;
CREATE SCHEMA IF NOT EXISTS load_test_private;
REVOKE ALL ON SCHEMA load_test_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA load_test_private TO service_role;
CREATE TABLE IF NOT EXISTS load_test_private.run (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  run_id text NOT NULL CHECK (run_id ~ '^[0-9a-f]{8}$'),
  baseline bigint,
  stock jsonb NOT NULL,
  cleaned boolean NOT NULL DEFAULT false
);
ALTER TABLE load_test_private.run ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON load_test_private.run FROM PUBLIC, anon, authenticated;
GRANT ALL ON load_test_private.run TO service_role;

CREATE OR REPLACE FUNCTION public.load_test_prepare(p_run text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE v_baseline bigint; v_stock jsonb;
BEGIN
  IF p_run IS NULL OR p_run !~ '^[0-9a-f]{8}$' THEN RAISE EXCEPTION 'INVALID_RUN'; END IF;
  -- Stop the app/sweep before prepare/cleanup. Competing app lock orders may deadlock:
  -- PostgreSQL aborts the entire transaction; never retry individual mutations.
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE load_test_private.run, public.orders, public.order_items,
    public.menu_items, public.counters IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM load_test_private.run WHERE NOT cleaned OR run_id = p_run) THEN
    RAISE EXCEPTION 'RUN_ALREADY_EXISTS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders) THEN RAISE EXCEPTION 'EMPTY_DATABASE_REQUIRED'; END IF;
  IF to_regprocedure('public.consume_rate_limit(text,text,integer,integer,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'T51_MIGRATION_REQUIRED';
  END IF;
  SELECT value INTO v_baseline FROM public.counters WHERE key = 'pickup_number';
  IF v_baseline < 0 THEN RAISE EXCEPTION 'INVALID_COUNTER'; END IF;
  SELECT jsonb_object_agg(id::text, stock) INTO v_stock FROM public.menu_items;
  IF v_stock IS NULL THEN RAISE EXCEPTION 'SEED_MENUS_REQUIRED'; END IF;
  DELETE FROM load_test_private.run;
  INSERT INTO load_test_private.run(run_id, baseline, stock) VALUES(p_run, v_baseline, v_stock);
  RETURN jsonb_build_object('run', p_run, 'baseline', v_baseline, 'stock', v_stock);
END;
$$;

CREATE OR REPLACE FUNCTION public.load_test_inspect(p_run text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('run', run_id, 'prepared', NOT cleaned)
  FROM load_test_private.run WHERE run_id = p_run;
$$;

CREATE OR REPLACE FUNCTION public.load_test_cleanup(p_run text, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE v_run load_test_private.run; v_count bigint; v_counter bigint; v_stock jsonb;
BEGIN
  IF p_run IS NULL OR p_run !~ '^[0-9a-f]{8}$' OR p_dry_run IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT'; END IF;
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE load_test_private.run, public.orders, public.order_items,
    public.menu_items, public.counters IN ACCESS EXCLUSIVE MODE;
  SELECT * INTO STRICT v_run FROM load_test_private.run WHERE run_id = p_run;
  IF v_run.cleaned THEN RETURN jsonb_build_object('alreadyCleaned', true); END IF;
  -- UUID is explicitly converted to text; the full run key shape is checked.
  IF EXISTS (SELECT 1 FROM public.orders WHERE
    coalesce(idempotency_key::text, '') !~ ('^00000000-0000-4a29-8000-' || p_run || '[0-9a-f]{4}$')) THEN
    RAISE EXCEPTION 'REAL_OR_OTHER_RUN_ORDER_DETECTED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE status NOT IN ('pending','cancelled','refunded','expired')) THEN
    RAISE EXCEPTION 'UNEXPECTED_ORDER_STATE';
  END IF;
  SELECT count(*) INTO v_count FROM public.orders;
  SELECT value INTO v_counter FROM public.counters WHERE key = 'pickup_number';
  IF (v_count = 0 AND v_counter IS DISTINCT FROM v_run.baseline) OR
     (v_count > 0 AND v_counter IS DISTINCT FROM coalesce(v_run.baseline, 0) + v_count) OR
     EXISTS (SELECT 1 FROM public.orders WHERE pickup_number <= coalesce(v_run.baseline, 0) OR pickup_number > v_counter) THEN
    RAISE EXCEPTION 'COUNTER_CHANGED_OR_ORDER_MISSING';
  END IF;
  -- Validate baseline before writing: catches stock edits and added/missing menus.
  SELECT jsonb_object_agg(m.id::text, m.stock::bigint + coalesce(q.qty, 0)) INTO v_stock
  FROM public.menu_items m LEFT JOIN (
    SELECT i.menu_item_id, sum(i.quantity)::bigint qty FROM public.order_items i
    JOIN public.orders o ON o.id = i.order_id WHERE o.status = 'pending' GROUP BY i.menu_item_id
  ) q ON q.menu_item_id = m.id;
  IF v_stock IS DISTINCT FROM v_run.stock THEN RAISE EXCEPTION 'STOCK_BASELINE_MISMATCH'; END IF;
  IF p_dry_run THEN RETURN jsonb_build_object('orders', v_count, 'dryRun', true, 'baseline', v_run.baseline); END IF;
  UPDATE public.menu_items m SET stock = m.stock + q.qty FROM (
    SELECT i.menu_item_id, sum(i.quantity)::integer qty FROM public.order_items i
    JOIN public.orders o ON o.id = i.order_id WHERE o.status = 'pending' GROUP BY i.menu_item_id
  ) q WHERE q.menu_item_id = m.id;
  DELETE FROM public.orders; -- every row checked under ACCESS EXCLUSIVE lock
  IF v_run.baseline IS NULL THEN
    DELETE FROM public.counters WHERE key = 'pickup_number';
  ELSE
    UPDATE public.counters SET value = v_run.baseline WHERE key = 'pickup_number';
  END IF;
  UPDATE load_test_private.run SET cleaned = true;
  RETURN jsonb_build_object('orders', v_count, 'dryRun', false, 'baseline', v_run.baseline);
END;
$$;
REVOKE ALL ON FUNCTION public.load_test_prepare(text), public.load_test_inspect(text),
  public.load_test_cleanup(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_test_prepare(text), public.load_test_inspect(text),
  public.load_test_cleanup(text, boolean) TO service_role;
COMMIT;

