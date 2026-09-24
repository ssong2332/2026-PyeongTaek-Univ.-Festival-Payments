-- Run only on an isolated database after migrations, as its migration owner.
-- Test fixtures and temporary grants are rolled back together.
BEGIN;

DO $$
DECLARE
    table_name text;
    enum_values text[];
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'menu_items', 'menu_item_translations', 'option_groups',
        'option_group_translations', 'options', 'option_translations',
        'counters', 'orders', 'order_items', 'order_item_options',
        'order_status_history', 'app_settings'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = table_name AND c.relrowsecurity
        ) THEN
            RAISE EXCEPTION 'Missing table or RLS: %', table_name;
        END IF;
        IF has_table_privilege('anon', 'public.' || table_name, 'SELECT')
            OR has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
            OR has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
            OR has_table_privilege('authenticated', 'public.' || table_name, 'DELETE')
            OR has_table_privilege('authenticated', 'public.' || table_name, 'TRUNCATE') THEN
            RAISE EXCEPTION 'Excess client privileges: %', table_name;
        END IF;
        IF table_name <> 'counters' AND NOT has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') THEN
            RAISE EXCEPTION 'Missing authenticated read grant: %', table_name;
        END IF;
        IF NOT has_table_privilege('service_role', 'public.' || table_name, 'INSERT') THEN
            RAISE EXCEPTION 'Missing service write grant: %', table_name;
        END IF;
    END LOOP;
    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO enum_values
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'order_status';
    IF enum_values IS DISTINCT FROM ARRAY['pending','paid','cooking','completed','cancelled','refunded','expired'] THEN
        RAISE EXCEPTION 'Order status contract mismatch';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'orders'
        AND indexdef LIKE '%(status, created_at)%')
        OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'orders'
        AND indexdef LIKE '%(created_at)%')
        OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'order_status_history'
        AND indexdef LIKE '%(order_id, created_at)%') THEN
        RAISE EXCEPTION 'Missing query index';
    END IF;
    IF has_sequence_privilege('anon', 'public.order_status_history_id_seq', 'USAGE')
        OR has_sequence_privilege('authenticated', 'public.order_status_history_id_seq', 'USAGE') THEN
        RAISE EXCEPTION 'Client can consume history sequence';
    END IF;
END $$;

SET LOCAL ROLE service_role;

INSERT INTO public.menu_items (id, base_price, stock, updated_at)
VALUES ('10000000-0000-4000-8000-000000000001', 0, 0, '2000-01-01');
INSERT INTO public.menu_item_translations (menu_item_id, locale, name)
VALUES ('10000000-0000-4000-8000-000000000001', 'ko', '테스트 메뉴');
INSERT INTO public.option_groups (id, menu_item_id, min_select, max_select)
VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 0, 0);
INSERT INTO public.option_group_translations (option_group_id, locale, name)
VALUES ('20000000-0000-4000-8000-000000000001', 'ko', '테스트 그룹');
INSERT INTO public.options (id, option_group_id, extra_price)
VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 0);
INSERT INTO public.option_translations (option_id, locale, name)
VALUES ('30000000-0000-4000-8000-000000000001', 'ko', '테스트 옵션');
INSERT INTO public.counters (key, value) VALUES ('t03_test', 0);
INSERT INTO public.app_settings (key, value) VALUES ('t03_test', 'false');
INSERT INTO public.orders (id, pickup_number, payment_method, total_amount, idempotency_key, status_token, updated_at)
VALUES ('40000000-0000-4000-8000-000000000001', 2147483600, 'cash', 0,
    '50000000-0000-4000-8000-000000000001', repeat('a', 64), '2000-01-01');
INSERT INTO public.order_items (id, order_id, menu_item_id, menu_name_ko, unit_price, quantity, options_price, line_total)
VALUES ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', '테스트 메뉴', 0, 1, 0, 0);
INSERT INTO public.order_item_options (id, order_item_id, option_id, option_group_name_ko, option_name_ko, extra_price)
VALUES ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001', '테스트 그룹', '테스트 옵션', 0);
INSERT INTO public.order_status_history (order_id, from_status, to_status, action, actor_type)
VALUES ('40000000-0000-4000-8000-000000000001', NULL, 'pending', 'create', 'customer');

DO $$
BEGIN
    IF (SELECT status FROM public.orders WHERE id = '40000000-0000-4000-8000-000000000001') <> 'pending' THEN
        RAISE EXCEPTION 'Wrong default order status';
    END IF;
    BEGIN
        UPDATE public.menu_items SET stock = -1 WHERE id = '10000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Negative stock accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.menu_items SET base_price = -1 WHERE id = '10000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Negative price accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.options SET extra_price = -1 WHERE id = '30000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Negative option price accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.option_groups SET min_select = 2, max_select = 1 WHERE id = '20000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Invalid option selection range accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.menu_item_translations SET name = '' WHERE menu_item_id = '10000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Empty menu name accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.order_items SET quantity = 0 WHERE id = '60000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Zero quantity accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.order_items SET line_total = 1 WHERE id = '60000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Incorrect line total accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.orders SET payment_method = 'transfer' WHERE id = '40000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Transfer without method accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.orders SET transfer_method = 'bank' WHERE id = '40000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Cash with transfer method accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.orders SET status = 'unknown' WHERE id = '40000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Unknown enum value accepted';
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.menu_item_translations (menu_item_id, locale, name)
        VALUES ('10000000-0000-4000-8000-000000000001', 'ko', '중복');
        RAISE EXCEPTION 'Duplicate translation accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.orders (pickup_number, payment_method, total_amount, idempotency_key, status_token)
        VALUES (2147483601, 'cash', 0, '50000000-0000-4000-8000-000000000001', repeat('b',64));
        RAISE EXCEPTION 'Duplicate idempotency key accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.orders (pickup_number, payment_method, total_amount, idempotency_key, status_token)
        VALUES (2147483600, 'cash', 0, gen_random_uuid(), repeat('b',64));
        RAISE EXCEPTION 'Duplicate pickup number accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.orders (pickup_number, payment_method, total_amount, idempotency_key, status_token)
        VALUES (2147483601, 'cash', 0, gen_random_uuid(), repeat('a',64));
        RAISE EXCEPTION 'Duplicate status token accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.order_items SET menu_item_id = '10000000-0000-4000-8000-000000000099'
        WHERE id = '60000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Unknown menu FK accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        DELETE FROM public.menu_items WHERE id = '10000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Ordered menu deletion accepted';
    EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL;
    END;
    BEGIN
        DELETE FROM public.options WHERE id = '30000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Ordered option deletion accepted';
    EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL;
    END;

    UPDATE public.menu_items SET stock = 1 WHERE id = '10000000-0000-4000-8000-000000000001';
    UPDATE public.order_items SET unit_price = 3000, options_price = 500, quantity = 2, line_total = 7000
    WHERE id = '60000000-0000-4000-8000-000000000001';
    IF (SELECT line_total FROM public.order_items WHERE id = '60000000-0000-4000-8000-000000000001') <> 7000 THEN
        RAISE EXCEPTION 'Valid positive line total rejected';
    END IF;
    UPDATE public.menu_item_translations SET name = '변경된 메뉴 이름'
    WHERE menu_item_id = '10000000-0000-4000-8000-000000000001' AND locale = 'ko';
    IF (SELECT menu_name_ko FROM public.order_items WHERE id = '60000000-0000-4000-8000-000000000001') <> '테스트 메뉴' THEN
        RAISE EXCEPTION 'Menu edit changed historical snapshot';
    END IF;
    UPDATE public.orders SET payment_method = 'transfer', transfer_method = 'bank'
    WHERE id = '40000000-0000-4000-8000-000000000001';
    IF (SELECT updated_at FROM public.menu_items WHERE id = '10000000-0000-4000-8000-000000000001') <> now()
        OR (SELECT updated_at FROM public.orders WHERE id = '40000000-0000-4000-8000-000000000001') <> now() THEN
        RAISE EXCEPTION 'updated_at trigger failed';
    END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE table_name text; row_total bigint;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'menu_items', 'menu_item_translations', 'option_groups', 'option_group_translations',
        'options', 'option_translations', 'orders', 'order_items', 'order_item_options',
        'order_status_history', 'app_settings'
    ] LOOP
        EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO row_total;
        IF row_total < 1 THEN RAISE EXCEPTION 'Read policy missing: %', table_name; END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = '40000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'Authenticated SELECT denied';
    END IF;
    BEGIN
        UPDATE public.orders SET total_amount = 1 WHERE id = '40000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Authenticated UPDATE allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM * FROM public.counters;
        RAISE EXCEPTION 'Authenticated counter access allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.orders;
        RAISE EXCEPTION 'Anon SELECT allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

-- Verify RLS itself still denies access if a future migration grants table ACLs.
RESET ROLE;
GRANT SELECT ON public.orders, public.counters TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.orders TO authenticated;
SET LOCAL ROLE anon;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.orders) THEN
        RAISE EXCEPTION 'Anon RLS leaked orders';
    END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE affected int;
BEGIN
    IF EXISTS (SELECT 1 FROM public.counters) THEN
        RAISE EXCEPTION 'Counter RLS leaked rows';
    END IF;
    UPDATE public.orders SET total_amount = 1 WHERE id = '40000000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'RLS allowed UPDATE'; END IF;
    DELETE FROM public.orders WHERE id = '40000000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'RLS allowed DELETE'; END IF;
    BEGIN
        INSERT INTO public.orders (pickup_number, payment_method, total_amount, idempotency_key, status_token)
        VALUES (2147483602, 'cash', 0, gen_random_uuid(), repeat('c',64));
        RAISE EXCEPTION 'RLS allowed INSERT';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

SET LOCAL ROLE service_role;
DELETE FROM public.orders WHERE id = '40000000-0000-4000-8000-000000000001';
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.order_items WHERE id = '60000000-0000-4000-8000-000000000001')
        OR EXISTS (SELECT 1 FROM public.order_item_options WHERE id = '70000000-0000-4000-8000-000000000001')
        OR EXISTS (SELECT 1 FROM public.order_status_history WHERE order_id = '40000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'Order child rows did not cascade';
    END IF;
END $$;
DELETE FROM public.menu_items WHERE id = '10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.menu_item_translations WHERE menu_item_id = '10000000-0000-4000-8000-000000000001')
        OR EXISTS (SELECT 1 FROM public.option_groups WHERE id = '20000000-0000-4000-8000-000000000001')
        OR EXISTS (SELECT 1 FROM public.option_group_translations WHERE option_group_id = '20000000-0000-4000-8000-000000000001')
        OR EXISTS (SELECT 1 FROM public.options WHERE id = '30000000-0000-4000-8000-000000000001')
        OR EXISTS (SELECT 1 FROM public.option_translations WHERE option_id = '30000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'Menu child rows did not cascade';
    END IF;
END $$;
RESET ROLE;
ROLLBACK;
