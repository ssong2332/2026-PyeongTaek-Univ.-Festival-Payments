-- T-53 간편결제 제외 스키마 검증. 전체 마이그레이션 적용 후 격리 DB에서 실행한다.
-- 테스트 데이터는 마지막 ROLLBACK으로 모두 되돌린다.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'transfer_method'
    ) THEN
        RAISE EXCEPTION 'orders.transfer_method column still exists';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname IN ('transfer_method', 'refund_channel_pre_t53')
    ) THEN
        RAISE EXCEPTION 'Removed enum type still exists';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.orders'::regclass
          AND conname = 'orders_transfer_method_matches_payment'
    ) THEN
        RAISE EXCEPTION 'orders_transfer_method_matches_payment still exists';
    END IF;
    IF (
        SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'payment_method'
    ) IS DISTINCT FROM ARRAY['cash', 'transfer'] THEN
        RAISE EXCEPTION 'payment_method contract mismatch';
    END IF;
    IF (
        SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'refund_channel'
    ) IS DISTINCT FROM ARRAY['cash', 'bank'] THEN
        RAISE EXCEPTION 'refund_channel contract mismatch';
    END IF;
    IF (
        SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
        WHERE a.attrelid = 'public.orders'::regclass AND a.attname = 'refund_channel' AND NOT a.attisdropped
    ) IS DISTINCT FROM 'refund_channel' THEN
        RAISE EXCEPTION 'orders.refund_channel is not bound to public.refund_channel';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.app_settings
        WHERE key IN ('transfer.kakaopay_url_template', 'transfer.toss_url_template')
    ) THEN
        RAISE EXCEPTION 'Easy-pay settings keys still exist';
    END IF;
END $$;

SET LOCAL ROLE service_role;
DO $$
BEGIN
    -- 결제수단은 cash / transfer만 저장된다(송금 하위 수단 없이 계좌이체 저장 가능).
    INSERT INTO public.orders (id, pickup_number, payment_method, total_amount, idempotency_key, status_token)
    VALUES
        ('53000000-0000-4000-8000-000000000001', 2147483641, 'cash', 3000,
         '53000000-0000-4000-8000-0000000000a1', repeat('x', 64)),
        ('53000000-0000-4000-8000-000000000002', 2147483642, 'transfer', 3000,
         '53000000-0000-4000-8000-0000000000a2', repeat('y', 64));
    BEGIN
        INSERT INTO public.orders (pickup_number, payment_method, total_amount, idempotency_key, status_token)
        VALUES (2147483643, 'card', 3000, gen_random_uuid(), repeat('z', 64));
        RAISE EXCEPTION 'Unknown payment method accepted';
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.orders (pickup_number, payment_method, total_amount, idempotency_key, status_token)
        VALUES (2147483643, 'kakaopay', 3000, gen_random_uuid(), repeat('z', 64));
        RAISE EXCEPTION 'kakaopay payment method accepted';
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;

    -- 환불 수단은 cash / bank 두 값만 허용된다.
    UPDATE public.orders SET refund_channel = 'cash' WHERE id = '53000000-0000-4000-8000-000000000001';
    UPDATE public.orders SET refund_channel = 'bank' WHERE id = '53000000-0000-4000-8000-000000000002';
    IF (SELECT count(*) FROM public.orders
        WHERE id IN ('53000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000002')
          AND refund_channel IS NOT NULL) <> 2 THEN
        RAISE EXCEPTION 'Valid refund channels rejected';
    END IF;
    BEGIN
        UPDATE public.orders SET refund_channel = 'kakaopay' WHERE id = '53000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'kakaopay refund channel accepted';
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
    BEGIN
        UPDATE public.orders SET refund_channel = 'toss' WHERE id = '53000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'toss refund channel accepted';
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
END $$;
RESET ROLE;

ROLLBACK;
