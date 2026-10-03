-- =========================================================
-- T-27 / F-33: 직원 호출 알림 (staff_calls)
-- 기준: Architecture.md 327행, PRD F-33
-- staff_calls(id, order_id FK, called_at, acknowledged_at, acknowledged_by)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.staff_calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
    called_at timestamptz NOT NULL DEFAULT now(),
    acknowledged_at timestamptz,
    acknowledged_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 같은 주문의 최근 호출 시간 조회용 인덱스 (2분 쿨다운 체크)
CREATE INDEX IF NOT EXISTS idx_staff_calls_order_called_at
    ON public.staff_calls (order_id, called_at DESC);

-- 관리자 대시보드 미확인 호출 조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_staff_calls_unacknowledged
    ON public.staff_calls (called_at DESC)
    WHERE acknowledged_at IS NULL;

-- RLS 활성화 (ADR-0001: 모든 데이터 접근은 Route Handler의 service_role 경유)
ALTER TABLE public.staff_calls ENABLE ROW LEVEL SECURITY;
