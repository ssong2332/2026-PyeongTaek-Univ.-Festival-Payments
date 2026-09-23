-- =========================================================
-- T-36 초기 메뉴·옵션 시드 데이터
-- 담당: 김혁 (DB2)
-- 기준: T-03 / 0001_schema.sql
-- 현재 기본 호떡 1개 등록
-- =========================================================

BEGIN;

-- 기본 호떡 메뉴
INSERT INTO public.menu_items (
    id,
    base_price,
    stock,
    is_sold_out_manual,
    is_active,
    sort_order
)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    0,      -- TODO: 가격 확정 후 수정
    0,      -- TODO: 초기 재고 확정 후 수정
    false,
    true,
    1
)
ON CONFLICT (id) DO UPDATE SET
    base_price = EXCLUDED.base_price,
    stock = EXCLUDED.stock,
    is_sold_out_manual = EXCLUDED.is_sold_out_manual,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;


-- 기본 호떡 한글
INSERT INTO public.menu_item_translations (
    menu_item_id,
    locale,
    name,
    description
)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'ko',
    '기본 호떡',
    '기본 호떡'
)
ON CONFLICT (menu_item_id, locale) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;


-- 기본 호떡 영문
INSERT INTO public.menu_item_translations (
    menu_item_id,
    locale,
    name,
    description
)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'en',
    'Original Hotteok',
    'Original Korean sweet pancake'
)
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