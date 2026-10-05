-- T-30 / N-15: 2026-11-08 주문 데이터 파기용. 운영 DB에서 실행하지 않은 초안이다.
-- 실행 전 docs/T-30-data-purge.md의 프로젝트·대상 범위·쓰기 중단 점검을 완료한다.
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
