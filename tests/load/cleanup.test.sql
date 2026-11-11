-- Run only in a dedicated disposable database after schema, T-51, and local-only.sql.
BEGIN;
TRUNCATE public.orders CASCADE;
DELETE FROM public.counters;
DELETE FROM load_test_private.run;
INSERT INTO public.menu_items(id, base_price, stock)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1000, 5000);

CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.fixture(n integer, state public.order_status DEFAULT 'pending') RETURNS void LANGUAGE plpgsql AS $$
DECLARE oid uuid;
BEGIN
  INSERT INTO public.orders(pickup_number, status, payment_method, total_amount, idempotency_key, status_token)
  VALUES(n, state, 'cash', 1000, ('00000000-0000-4a29-8000-aabbccdd' || lpad(to_hex(n),4,'0'))::uuid, 'token-' || n)
  RETURNING id INTO oid;
  INSERT INTO public.order_items(order_id, menu_item_id, menu_name_ko, unit_price, quantity, line_total)
  VALUES(oid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test', 1000, 1, 1000);
  IF state = 'pending' THEN UPDATE public.menu_items SET stock=stock-1 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; END IF;
  INSERT INTO public.counters(key,value) VALUES('pickup_number',n) ON CONFLICT(key) DO UPDATE SET value=n;
END $$;
SELECT public.load_test_prepare('aabbccdd');
SELECT pg_temp.fixture(1);
SELECT pg_temp.fixture(2, 'cancelled');
SELECT pg_temp.fixture(3, 'expired');
SELECT pg_temp.fixture(4, 'refunded');
SELECT pg_temp.assert_true((public.load_test_cleanup('aabbccdd',true)->>'orders')::int=4,'dry run count');
SELECT pg_temp.assert_true((SELECT stock=4999 FROM public.menu_items WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'dry run stock');

-- Actual order contamination must leave ALL data untouched.
DO $$ BEGIN
  UPDATE public.orders SET idempotency_key='12345678-1234-4123-8123-123456789012' WHERE pickup_number=1;
  BEGIN
    PERFORM public.load_test_cleanup('aabbccdd',false);
    RAISE EXCEPTION 'cleanup should reject real order';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'REAL_OR_OTHER_RUN_ORDER_DETECTED' THEN RAISE; END IF; END;
  PERFORM pg_temp.assert_true((SELECT count(*)=4 FROM public.orders),'mixed orders preserved');
  UPDATE public.orders SET idempotency_key='00000000-0000-4a29-8000-aabbccdd0001' WHERE pickup_number=1;
END $$;

-- Fail AFTER stock update, proving whole-RPC rollback rather than partial cleanup.
CREATE FUNCTION pg_temp.reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_DELETE_FAILURE'; END $$;
CREATE TRIGGER injected_delete BEFORE DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_delete();
DO $$ BEGIN
  BEGIN
    PERFORM public.load_test_cleanup('aabbccdd',false);
    RAISE EXCEPTION 'cleanup should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'INJECTED_DELETE_FAILURE' THEN RAISE; END IF; END;
  PERFORM pg_temp.assert_true((SELECT stock=4999 FROM public.menu_items WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'stock update rolled back');
  PERFORM pg_temp.assert_true((SELECT value=4 FROM public.counters WHERE key='pickup_number'),'counter unchanged');
  PERFORM pg_temp.assert_true((SELECT NOT cleaned FROM load_test_private.run),'completion unchanged');
END $$;
DROP TRIGGER injected_delete ON public.orders;

DO $$ BEGIN
  UPDATE public.counters SET value=5 WHERE key='pickup_number';
  BEGIN
    PERFORM public.load_test_cleanup('aabbccdd',false);
    RAISE EXCEPTION 'counter change should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'COUNTER_CHANGED_OR_ORDER_MISSING' THEN RAISE; END IF; END;
  UPDATE public.counters SET value=4 WHERE key='pickup_number';
  UPDATE public.orders SET status='cooking' WHERE pickup_number=1;
  BEGIN
    PERFORM public.load_test_cleanup('aabbccdd',false);
    RAISE EXCEPTION 'cooking should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'UNEXPECTED_ORDER_STATE' THEN RAISE; END IF; END;
  UPDATE public.orders SET status='pending' WHERE pickup_number=1;
  UPDATE public.menu_items SET stock=stock+1 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  BEGIN
    PERFORM public.load_test_cleanup('aabbccdd',false);
    RAISE EXCEPTION 'stock change should fail';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'STOCK_BASELINE_MISMATCH' THEN RAISE; END IF; END;
  UPDATE public.menu_items SET stock=stock-1 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
END $$;
SELECT public.load_test_cleanup('aabbccdd',false);
SELECT pg_temp.assert_true((SELECT stock=5000 FROM public.menu_items WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'restore pending only');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.orders),'orders deleted');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.order_items),'items cascaded');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.counters WHERE key='pickup_number'),'absent baseline restored');
SELECT pg_temp.assert_true((public.load_test_cleanup('aabbccdd',false)->>'alreadyCleaned')::boolean,'idempotent retry');

-- Existing nonzero baseline and >REST page size. Preserve bigint baseline.
DELETE FROM load_test_private.run;
INSERT INTO public.counters(key,value) VALUES('pickup_number',10);
SELECT public.load_test_prepare('aabbccdd');
SELECT pg_temp.fixture(n) FROM generate_series(11,1510) n;
SELECT public.load_test_cleanup('aabbccdd',false);
SELECT pg_temp.assert_true((SELECT value=10 FROM public.counters WHERE key='pickup_number'),'nonzero baseline restored');
SELECT pg_temp.assert_true((SELECT stock=5000 FROM public.menu_items WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'1500 orders restored once');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.load_test_cleanup(text,boolean)','EXECUTE'),'anon denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.load_test_prepare(text)','EXECUTE'),'authenticated denied');
ROLLBACK;
