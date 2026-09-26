-- T-53 간편결제 제외 스키마 반영 (PRD Open Question #40, DECISIONS #39, 2026-09-24).
-- Forward-only: 0001_schema.sql은 수정하지 않는다(Tasks T-53). Requires 0001, 0003, 0007.
-- 이 파일보다 먼저 refund_channel을 쓰는 함수(transition_order 등)가 생성돼 있으면
-- 아래 DROP TYPE이 의존성 오류로 실패한다 — 함수 마이그레이션은 이 파일 뒤 번호여야 한다.
BEGIN;

-- 삭제되는 환불 수단으로 기록된 주문이 있으면 추측 변환하지 않고 중단한다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.orders WHERE refund_channel::text IN ('kakaopay', 'toss')
    ) THEN
        RAISE EXCEPTION 'T-53: orders.refund_channel에 kakaopay/toss 값이 있어 중단합니다. 데이터 처리 방침을 먼저 정하세요.';
    END IF;
END $$;

-- 1~3. 송금 하위 수단 제거: CHECK → 컬럼 → enum 순서.
ALTER TABLE public.orders DROP CONSTRAINT orders_transfer_method_matches_payment;
ALTER TABLE public.orders DROP COLUMN transfer_method;
DROP TYPE public.transfer_method;

-- 4. refund_channel을 ('cash', 'bank')로 재정의. enum 값은 삭제할 수 없어 새 타입으로 교체한다.
ALTER TYPE public.refund_channel RENAME TO refund_channel_pre_t53;
CREATE TYPE public.refund_channel AS ENUM ('cash', 'bank');
ALTER TABLE public.orders
    ALTER COLUMN refund_channel TYPE public.refund_channel
    USING refund_channel::text::public.refund_channel;
DROP TYPE public.refund_channel_pre_t53;

-- 5. 과거 시드로 들어갔을 수 있는 간편결제 설정 키 삭제(없으면 0행, 재실행 안전).
DELETE FROM public.app_settings
WHERE key IN ('transfer.kakaopay_url_template', 'transfer.toss_url_template');

COMMIT;
