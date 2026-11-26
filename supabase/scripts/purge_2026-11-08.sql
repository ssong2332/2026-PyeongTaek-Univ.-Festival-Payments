-- T-30 / N-15: 2026-11-08 예정일이 지난 주문 데이터 파기용 미승인 초안.
-- 운영 실행 여부는 별도 확인 대상이다. 이 파일의 날짜 가드는 프로젝트·범위 승인을 대신하지 않는다.
-- 실행 전 docs/T-30-data-purge.md의 프로젝트·대상 범위·쓰기 중단·팀장 승인 점검을 완료한다.
-- Supabase SQL Editor에서 전체 파일을 한 번에 실행한다. 마이그레이션으로 적용하지 않는다.
-- 새 주문 참조 테이블이 생기면 RESTRICT가 실패한다. CASCADE를 붙여 우회하지 않는다.
BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
    IF (now() AT TIME ZONE 'Asia/Seoul')::date < DATE '2026-11-08' THEN
        RAISE EXCEPTION 'T-30 purge is not allowed before 2026-11-08 KST';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.counters WHERE key = 'pickup_number') THEN
        RAISE EXCEPTION 'pickup_number counter is missing; inspect the target database';
    END IF;
END;
$$;

-- 보존 테이블의 동시 쓰기를 막고, 전체 행 값을 트랜잭션 내부에만 보관한다.
-- 이 임시 스냅샷은 COMMIT 또는 ROLLBACK 시 사라지며 결과에 원문을 출력하지 않는다.
LOCK TABLE public.menu_items, public.menu_item_translations,
    public.option_groups, public.option_group_translations,
    public.options, public.option_translations,
    public.app_settings, public.counters, public.shifts IN SHARE MODE;

CREATE TEMP TABLE purge_preserved_before (
    relation_name text PRIMARY KEY,
    snapshot_rows jsonb NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
    relation_name text;
    snapshot jsonb;
BEGIN
    FOREACH relation_name IN ARRAY ARRAY[
        'menu_items', 'menu_item_translations', 'option_groups',
        'option_group_translations', 'options', 'option_translations',
        'app_settings', 'shifts'
    ] LOOP
        EXECUTE format(
            'SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)), ''[]''::jsonb) FROM public.%I AS t',
            relation_name
        ) INTO snapshot;
        INSERT INTO purge_preserved_before VALUES (relation_name, snapshot);
    END LOOP;

    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)), '[]'::jsonb)
      INTO snapshot FROM public.counters AS t WHERE key <> 'pickup_number';
    INSERT INTO purge_preserved_before VALUES ('counters_except_pickup_number', snapshot);
END;
$$;

-- 아래 두 결과의 건수만 실행 기록에 남긴다. 행 원문·토큰은 기록하지 않는다.
SELECT 'before' AS phase,
       (SELECT count(*) FROM public.orders) AS orders,
       (SELECT count(*) FROM public.order_items) AS order_items,
       (SELECT count(*) FROM public.order_item_options) AS order_item_options,
       (SELECT count(*) FROM public.order_status_history) AS order_status_history,
       (SELECT count(*) FROM public.reviews) AS reviews,
       (SELECT count(*) FROM public.staff_calls) AS staff_calls,
       (SELECT count(*) FROM public.rate_limits) AS rate_limits;

-- 모든 주문 참조 테이블을 명시한다. 새 FK가 추가되면 RESTRICT가 중단시킨다.
TRUNCATE TABLE
    public.order_item_options,
    public.order_status_history,
    public.reviews,
    public.staff_calls,
    public.order_items,
    public.orders,
    public.rate_limits
RESTRICT;

-- DECISIONS #30: 축제 주문 파기 후 픽업 번호를 초기화한다. 다른 counter는 유지한다.
UPDATE public.counters SET value = 0 WHERE key = 'pickup_number';

DO $$
DECLARE
    preserved record;
    current_rows jsonb;
BEGIN
    IF EXISTS (SELECT 1 FROM public.orders)
       OR EXISTS (SELECT 1 FROM public.order_items)
       OR EXISTS (SELECT 1 FROM public.order_item_options)
       OR EXISTS (SELECT 1 FROM public.order_status_history)
       OR EXISTS (SELECT 1 FROM public.reviews)
       OR EXISTS (SELECT 1 FROM public.staff_calls)
       OR EXISTS (SELECT 1 FROM public.rate_limits)
       OR EXISTS (SELECT 1 FROM public.counters WHERE key = 'pickup_number' AND value <> 0) THEN
        RAISE EXCEPTION 'T-30 purge verification failed; transaction must be rolled back';
    END IF;

    FOR preserved IN SELECT relation_name, snapshot_rows FROM purge_preserved_before LOOP
        IF preserved.relation_name = 'counters_except_pickup_number' THEN
            SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)), '[]'::jsonb)
              INTO current_rows FROM public.counters AS t WHERE key <> 'pickup_number';
        ELSE
            EXECUTE format(
                'SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)), ''[]''::jsonb) FROM public.%I AS t',
                preserved.relation_name
            ) INTO current_rows;
        END IF;
        IF current_rows IS DISTINCT FROM preserved.snapshot_rows THEN
            RAISE EXCEPTION 'T-30 preserved relation % changed before commit; transaction must be rolled back',
                preserved.relation_name;
        END IF;
    END LOOP;
END;
$$;

SELECT 'after' AS phase,
       (SELECT count(*) FROM public.orders) AS orders,
       (SELECT count(*) FROM public.order_items) AS order_items,
       (SELECT count(*) FROM public.order_item_options) AS order_item_options,
       (SELECT count(*) FROM public.order_status_history) AS order_status_history,
       (SELECT count(*) FROM public.reviews) AS reviews,
       (SELECT count(*) FROM public.staff_calls) AS staff_calls,
       (SELECT count(*) FROM public.rate_limits) AS rate_limits,
       (SELECT value FROM public.counters WHERE key = 'pickup_number') AS pickup_counter;

COMMIT;
