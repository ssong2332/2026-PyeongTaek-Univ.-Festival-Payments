-- CI의 독립 festival_seed_test DB에서만 실행한다.
DO $$ BEGIN
    IF current_database() <> 'festival_seed_test' THEN
        RAISE EXCEPTION 'seed test requires festival_seed_test database';
    END IF;
END $$;

\ir ../../supabase/seed.sql

DO $$
DECLARE
    actual_names text[];
BEGIN
    IF (SELECT count(*) FROM public.menu_items) <> 10
        OR (SELECT count(*) FROM public.menu_item_translations) <> 20
        OR (SELECT array_agg(base_price ORDER BY sort_order) FROM public.menu_items)
           <> ARRAY[2000, 2500, 2500, 2500, 2500, 3000, 3000, 3000, 3500, 3500]
        OR EXISTS (SELECT 1 FROM public.menu_items WHERE stock <> 100 OR NOT is_active) THEN
        RAISE EXCEPTION 'confirmed menu count, price or initial stock mismatch';
    END IF;
    SELECT array_agg(t.name ORDER BY m.sort_order) INTO actual_names
    FROM public.menu_items m JOIN public.menu_item_translations t
      ON t.menu_item_id = m.id AND t.locale = 'ko';
    IF actual_names <> ARRAY[
        '기본 호떡', '허니버터 호떡', '체다치즈 호떡', '콘소메 호떡', '뿌링클 호떡',
        '콘치즈 호떡', '고구마 치즈 호떡', '흑임자 콩가루 호떡',
        '불닭 콘치즈 호떡', '말차 화이트초코 호떡'
    ] THEN RAISE EXCEPTION 'confirmed Korean menu names or order mismatch'; END IF;
    IF (SELECT count(*) FROM public.option_groups) <> 30
        OR (SELECT count(*) FROM public.option_group_translations) <> 60
        OR (SELECT count(*) FROM public.options) <> 90
        OR (SELECT count(*) FROM public.option_translations) <> 180
        OR EXISTS (SELECT 1 FROM public.options WHERE extra_price <> 500)
        OR EXISTS (SELECT 1 FROM public.option_groups WHERE min_select <> 0 OR max_select <> 1)
        OR EXISTS (
            SELECT 1 FROM public.menu_items m
            LEFT JOIN public.option_groups g ON g.menu_item_id = m.id
            LEFT JOIN public.option_group_translations gt ON gt.option_group_id = g.id AND gt.locale = 'ko'
            GROUP BY m.id
            HAVING count(DISTINCT g.id) <> 3
                OR count(DISTINCT gt.name) <> 3
        ) OR EXISTS (
            SELECT 1 FROM public.menu_items m
            LEFT JOIN public.option_groups g ON g.menu_item_id = m.id
            LEFT JOIN public.options o ON o.option_group_id = g.id
            GROUP BY m.id HAVING count(o.id) <> 9
        ) THEN RAISE EXCEPTION 'add-on group, option count or price mismatch'; END IF;
    IF (SELECT array_agg(t.name ORDER BY g.sort_order, o.sort_order)
        FROM public.option_groups g
        JOIN public.options o ON o.option_group_id = g.id
        JOIN public.option_translations t ON t.option_id = o.id AND t.locale = 'ko'
        WHERE g.menu_item_id = '11111111-1111-1111-1111-111111111111')
        <> ARRAY['허니버터', '체다치즈', '콘소메', '뿌링클', '말차', '콩가루',
                 '흑임자가루', '불닭 소스', '불닭 마요']
    THEN RAISE EXCEPTION 'add-on labels or order mismatch'; END IF;
    IF EXISTS (
        SELECT 1 FROM public.menu_items m CROSS JOIN (VALUES ('ko'), ('en')) l(locale)
        LEFT JOIN public.menu_item_translations t ON t.menu_item_id = m.id AND t.locale = l.locale
        WHERE NULLIF(btrim(t.name), '') IS NULL OR NULLIF(btrim(t.description), '') IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.options o CROSS JOIN (VALUES ('ko'), ('en')) l(locale)
        LEFT JOIN public.option_translations t ON t.option_id = o.id AND t.locale = l.locale
        WHERE NULLIF(btrim(t.name), '') IS NULL
    ) THEN RAISE EXCEPTION 'missing or empty translation'; END IF;
    IF (SELECT count(*) FROM public.app_settings) <> 6
       OR (SELECT value FROM public.counters WHERE key = 'pickup_number') IS DISTINCT FROM 0::bigint
    THEN RAISE EXCEPTION 'settings or pickup defaults mismatch'; END IF;
END $$;

UPDATE public.menu_items SET stock = 37, is_sold_out_manual = true, is_active = false;
UPDATE public.option_groups SET is_active = false;
UPDATE public.options SET is_active = false;
UPDATE public.app_settings SET value = '20' WHERE key = 'payment.expire_minutes';
UPDATE public.app_settings SET value = 'test-bank' WHERE key = 'transfer.bank_name';
UPDATE public.counters SET value = 150 WHERE key = 'pickup_number';

\ir ../../supabase/seed.sql

DO $$ BEGIN
    IF (SELECT count(*) FROM public.menu_items) <> 10
        OR (SELECT count(*) FROM public.menu_item_translations) <> 20
        OR (SELECT count(*) FROM public.option_groups) <> 30
        OR (SELECT count(*) FROM public.option_group_translations) <> 60
        OR (SELECT count(*) FROM public.options) <> 90
        OR (SELECT count(*) FROM public.option_translations) <> 180
    THEN RAISE EXCEPTION 'repeated seed created duplicate or missing records'; END IF;
    IF EXISTS (SELECT 1 FROM public.menu_items WHERE stock <> 37 OR NOT is_sold_out_manual OR is_active)
       OR EXISTS (SELECT 1 FROM public.option_groups WHERE is_active)
       OR EXISTS (SELECT 1 FROM public.options WHERE is_active)
    THEN RAISE EXCEPTION 'seed overwrote operational menu or option state'; END IF;
    IF (SELECT value FROM public.app_settings WHERE key = 'payment.expire_minutes') IS DISTINCT FROM '20'
       OR (SELECT value FROM public.app_settings WHERE key = 'transfer.bank_name') IS DISTINCT FROM 'test-bank'
       OR (SELECT value FROM public.counters WHERE key = 'pickup_number') IS DISTINCT FROM 150::bigint
    THEN RAISE EXCEPTION 'seed overwrote settings or pickup counter'; END IF;
END $$;

-- 운영 DB에 이미 들어간 구 메뉴는 삭제하거나 새 메뉴 ID로 재사용하지 않는다.
INSERT INTO public.menu_items (id, base_price, stock, is_active)
VALUES ('33333333-3333-3333-3333-333333333333', 3500, 12, true),
       ('44444444-4444-4444-4444-444444444444', 4000, 8, true);
INSERT INTO public.menu_item_translations (menu_item_id, locale, name, description)
VALUES ('33333333-3333-3333-3333-333333333333', 'ko', '불닭 치즈 호떡', '구 메뉴'),
       ('44444444-4444-4444-4444-444444444444', 'ko', '맛다시 호떡', '구 메뉴');

\ir ../../supabase/seed.sql

DO $$ BEGIN
    IF (SELECT count(*) FROM public.menu_items) <> 12
       OR EXISTS (
           SELECT 1 FROM public.menu_items
           WHERE id IN ('33333333-3333-3333-3333-333333333333',
                        '44444444-4444-4444-4444-444444444444')
             AND (is_active OR stock NOT IN (12, 8))
       )
       OR (SELECT count(*) FROM public.menu_item_translations
           WHERE name LIKE '% (판매 종료)') <> 2
    THEN RAISE EXCEPTION 'legacy menu retirement or stock preservation failed'; END IF;
END $$;

-- 판매 종료 처리는 최초 한 번만 적용한다. 이후 운영자가 활성화하면 재실행 시 유지한다.
UPDATE public.menu_items SET is_active = true
WHERE id = '33333333-3333-3333-3333-333333333333';
\ir ../../supabase/seed.sql
DO $$ BEGIN
    IF NOT (SELECT is_active FROM public.menu_items
            WHERE id = '33333333-3333-3333-3333-333333333333')
    THEN RAISE EXCEPTION 'seed repeated legacy retirement'; END IF;
END $$;
