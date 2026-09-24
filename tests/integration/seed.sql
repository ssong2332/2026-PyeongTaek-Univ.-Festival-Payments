-- CI의 독립 festival_seed_test DB에서만 실행한다.
DO $$ BEGIN
    IF current_database() <> 'festival_seed_test' THEN
        RAISE EXCEPTION 'seed test requires festival_seed_test database';
    END IF;
END $$;

\ir ../../supabase/seed.sql

DO $$ BEGIN
    IF (SELECT count(*) FROM public.menu_items) <> 4
        OR (SELECT array_agg(base_price ORDER BY sort_order) FROM public.menu_items)
            <> ARRAY[2000, 2500, 3500, 4000] THEN
        RAISE EXCEPTION 'menu count or prices mismatch';
    END IF;
    IF (SELECT count(*) FROM public.app_settings) <> 6 OR EXISTS (
        SELECT 1 FROM (VALUES
            ('payment.expire_minutes', '10'), ('auto_complete.enabled', 'false'),
            ('auto_complete.minutes', '15'), ('transfer.bank_name', ''),
            ('transfer.account_number', ''), ('transfer.account_holder', '')
        ) AS expected(key, value)
        LEFT JOIN public.app_settings actual USING (key)
        WHERE actual.value IS DISTINCT FROM expected.value
    ) THEN
        RAISE EXCEPTION 'settings defaults mismatch';
    END IF;
    IF (SELECT value FROM public.counters WHERE key = 'pickup_number') IS DISTINCT FROM 0::bigint THEN
        RAISE EXCEPTION 'initial pickup counter mismatch';
    END IF;
END $$;

UPDATE public.menu_items SET stock = 37, is_sold_out_manual = true, is_active = false;
UPDATE public.app_settings SET value = '20' WHERE key = 'payment.expire_minutes';
UPDATE public.app_settings SET value = 'test-bank' WHERE key = 'transfer.bank_name';
UPDATE public.counters SET value = 150 WHERE key = 'pickup_number';

\ir ../../supabase/seed.sql

DO $$ BEGIN
    IF (SELECT count(*) FROM public.menu_items) <> 4
        OR (SELECT count(*) FROM public.menu_item_translations) <> 8
        OR (SELECT count(*) FROM public.app_settings) <> 6
        OR (SELECT count(*) FROM public.counters) <> 1 THEN
        RAISE EXCEPTION 'repeated seed created duplicate or missing records';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.menu_items m CROSS JOIN (VALUES ('ko'), ('en')) AS locales(locale)
        LEFT JOIN public.menu_item_translations t ON t.menu_item_id = m.id AND t.locale = locales.locale
        WHERE t.name IS NULL OR btrim(t.name) = ''
    ) THEN
        RAISE EXCEPTION 'missing or empty menu translation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.menu_items WHERE stock <> 37 OR NOT is_sold_out_manual OR is_active) THEN
        RAISE EXCEPTION 'seed overwrote operational menu state';
    END IF;
    IF (SELECT value FROM public.app_settings WHERE key = 'payment.expire_minutes') IS DISTINCT FROM '20'
        OR (SELECT value FROM public.app_settings WHERE key = 'transfer.bank_name') IS DISTINCT FROM 'test-bank'
        OR (SELECT value FROM public.counters WHERE key = 'pickup_number') IS DISTINCT FROM 150::bigint THEN
        RAISE EXCEPTION 'seed overwrote settings or pickup counter';
    END IF;
END $$;
