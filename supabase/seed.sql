-- =========================================================
-- T-36 초기 메뉴·옵션 시드 데이터
-- 담당: 김혁 (DB2)
-- 기준: T-03 / 0001_schema.sql
-- 메뉴 4종 및 한국어·영어 번역
-- =========================================================

BEGIN;

-- 운영자가 수정한 설정과 이미 발급한 픽업 번호는 재실행 시 보존한다.
INSERT INTO public.app_settings (key, value)
VALUES
    ('payment.expire_minutes', '10'),
    ('auto_complete.enabled', 'false'),
    ('auto_complete.minutes', '15'),
    ('transfer.bank_name', ''),
    ('transfer.account_number', ''),
    ('transfer.account_holder', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.counters (key, value)
VALUES ('pickup_number', 0)
ON CONFLICT (key) DO NOTHING;

-- 호떡 메뉴 4종
INSERT INTO public.menu_items (
    id,
    base_price,
    stock,
    is_sold_out_manual,
    is_active,
    sort_order
)
VALUES
    ('11111111-1111-1111-1111-111111111111', 2000, 0, false, true, 1),
    ('22222222-2222-2222-2222-222222222222', 2500, 0, false, true, 2),
    ('33333333-3333-3333-3333-333333333333', 3500, 0, false, true, 3),
    ('44444444-4444-4444-4444-444444444444', 4000, 0, false, true, 4)
-- 초기 재고는 확정 전이므로 0. 재실행 시 운영 중인 재고·품절·활성 상태는 보존한다.
ON CONFLICT (id) DO UPDATE SET
    base_price = EXCLUDED.base_price,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.menu_item_translations (
    menu_item_id, locale, name, description
)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'ko', '기본호떡', '기본호떡'),
    ('11111111-1111-1111-1111-111111111111', 'en', 'Original Hotteok', 'Original Korean sweet pancake'),
    ('22222222-2222-2222-2222-222222222222', 'ko', '뿌링클 호떡', '뿌링클 호떡'),
    ('22222222-2222-2222-2222-222222222222', 'en', 'Bburinkle Hotteok', 'Bburinkle Hotteok'),
    ('33333333-3333-3333-3333-333333333333', 'ko', '불닭 치즈 호떡', '불닭 치즈 호떡'),
    ('33333333-3333-3333-3333-333333333333', 'en', 'Buldak Cheese Hotteok', 'Buldak Cheese Hotteok'),
    ('44444444-4444-4444-4444-444444444444', 'ko', '맛다시 호떡', '맛다시 호떡'),
    ('44444444-4444-4444-4444-444444444444', 'en', 'Matdasi Hotteok', 'Matdasi Hotteok')
ON CONFLICT (menu_item_id, locale) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 옵션은 현재 미정
-- 추후 아래 테이블에 확장
-- public.option_groups
-- public.option_group_translations
-- public.options
-- public.option_translations

COMMIT;
