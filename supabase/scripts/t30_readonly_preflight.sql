-- T-30 운영 사전 점검. SELECT와 카탈로그 조회만 수행한다.
-- SQL Editor에서 파일 전체를 실행하고 집계 결과만 별도 운영 기록에 옮긴다.
-- 프로젝트 ref/main은 이 SQL로 증명할 수 없으므로 대시보드·연결 정보에서 별도 대조한다.
-- 11/08 파기 실행 이력, 다른 행사 소유권, CSV/백업/로그 보관 여부도 별도 확인한다.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_user AS database_role,
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS observed_at_utc;

SELECT count(*) AS migration_count, max(version) AS latest_migration
FROM supabase_migrations.schema_migrations;

SELECT relation_name, row_count
FROM (
    SELECT 'orders' AS relation_name, count(*) AS row_count FROM public.orders
    UNION ALL SELECT 'order_items', count(*) FROM public.order_items
    UNION ALL SELECT 'order_item_options', count(*) FROM public.order_item_options
    UNION ALL SELECT 'order_status_history', count(*) FROM public.order_status_history
    UNION ALL SELECT 'reviews', count(*) FROM public.reviews
    UNION ALL SELECT 'staff_calls', count(*) FROM public.staff_calls
    UNION ALL SELECT 'rate_limits', count(*) FROM public.rate_limits
    UNION ALL SELECT 'shifts', count(*) FROM public.shifts
    UNION ALL SELECT 'menu_items', count(*) FROM public.menu_items
    UNION ALL SELECT 'app_settings', count(*) FROM public.app_settings
) AS counts
ORDER BY relation_name;

SELECT key, value AS pickup_number
FROM public.counters
WHERE key = 'pickup_number';

-- 주문 외 scope가 있으면 rate_limits 전체 파기 범위를 재결정한다. key/IP는 출력하지 않는다.
SELECT scope, count(*) AS row_count
FROM public.rate_limits
GROUP BY scope
ORDER BY scope;

-- 날짜는 혼재 가능성을 조사할 단서일 뿐, 행사 소유권의 증거가 아니다.
SELECT (COALESCE(manual_ordered_at, created_at) AT TIME ZONE 'Asia/Seoul')::date AS order_date_kst,
       source, count(*) AS row_count
FROM public.orders
GROUP BY 1, 2
ORDER BY 1, 2;

SELECT count(*) AS shifts_with_name, min(date) AS earliest_shift_date,
       max(date) AS latest_shift_date
FROM public.shifts
WHERE btrim(person_name) <> '';

SELECT count(*) AS storage_bucket_count FROM storage.buckets;
SELECT count(*) AS storage_object_count FROM storage.objects;
SELECT to_regclass('public.inventory_photos') IS NOT NULL AS inventory_photos_exists,
       to_regclass('public.inventory_photo_uploads') IS NOT NULL AS inventory_photo_uploads_exists;

-- 대상 밖 새 FK나 DELETE/TRUNCATE 트리거가 보이면 파기 SQL 범위를 재검토한다.
SELECT conrelid::regclass::text AS referencing_table,
       confrelid::regclass::text AS referenced_table,
       conname AS constraint_name
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid IN ('public.orders'::regclass, 'public.order_items'::regclass)
ORDER BY 2, 1, 3;

SELECT tgrelid::regclass::text AS table_name, tgname AS trigger_name,
       tgenabled AS enabled_state,
       (tgtype & 8) <> 0 AS on_delete,
       (tgtype & 32) <> 0 AS on_truncate
FROM pg_trigger
WHERE NOT tgisinternal
  AND ((tgtype & 8) <> 0 OR (tgtype & 32) <> 0)
ORDER BY 1, 2;

ROLLBACK;
