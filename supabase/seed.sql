-- T-36 확정 메뉴·옵션 시드. 운영 적용은 DB1 담당(DECISIONS #47).
-- 메뉴별 최초 재고 100개. 재실행 시 운영 재고·품절·활성 상태를 보존한다.
BEGIN;

INSERT INTO public.app_settings (key, value) VALUES
('payment.expire_minutes', '10'), ('auto_complete.enabled', 'false'),
('auto_complete.minutes', '15'), ('transfer.bank_name', ''),
('transfer.account_number', ''), ('transfer.account_holder', '')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.counters (key, value) VALUES ('pickup_number', 0)
ON CONFLICT (key) DO NOTHING;

-- 기존 주문의 메뉴 ID를 재사용하지 않는다. 구 메뉴 두 개만 한 번 판매 종료한다.
UPDATE public.menu_items AS m SET is_active = false
FROM public.menu_item_translations AS t
WHERE m.id IN ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444')
  AND t.menu_item_id = m.id AND t.locale = 'ko'
  AND ((m.id = '33333333-3333-3333-3333-333333333333' AND t.name = '불닭 치즈 호떡')
    OR (m.id = '44444444-4444-4444-4444-444444444444' AND t.name = '맛다시 호떡'));
UPDATE public.menu_item_translations SET name = name || ' (판매 종료)'
WHERE locale = 'ko'
  AND ((menu_item_id = '33333333-3333-3333-3333-333333333333' AND name = '불닭 치즈 호떡')
    OR (menu_item_id = '44444444-4444-4444-4444-444444444444' AND name = '맛다시 호떡'));

CREATE TEMP TABLE t36_menu_seed (
 id uuid PRIMARY KEY, price integer, position integer,
 name_ko text, description_ko text, name_en text, description_en text
) ON COMMIT DROP;
INSERT INTO t36_menu_seed VALUES
('11111111-1111-1111-1111-111111111111', 2000, 1, '기본 호떡', '달달한 호떡소가 가득 들어간 클래식 호떡', 'Original Hotteok', 'Classic hotteok filled with sweet syrup.'),
('55555555-5555-5555-5555-555555555555', 2500, 2, '허니버터 호떡', '달콤한 호떡에 고소하고 진한 허니버터 풍미를 듬뿍!', 'Honey Butter Hotteok', 'Sweet hotteok with rich honey butter flavor.'),
('66666666-6666-6666-6666-666666666666', 2500, 3, '체다치즈 호떡', '달콤한 호떡소와 짭짤하고 진한 체다치즈의 단짠 조합', 'Cheddar Cheese Hotteok', 'Sweet filling with savory, rich cheddar cheese.'),
('77777777-7777-7777-7777-777777777777', 2500, 4, '콘소메 호떡', '바삭하게 구운 호떡에 짭짤하고 고소한 콘소메 시즈닝을 듬뿍!', 'Consomme Hotteok', 'Crispy hotteok coated in savory consomme seasoning.'),
('22222222-2222-2222-2222-222222222222', 2500, 5, '뿌링클 호떡', '달콤한 호떡에 치즈 풍미 가득한 뿌링클 시즈닝을 듬뿍 입힌 단짠 호떡', 'Bburinkle Hotteok', 'Sweet hotteok coated in cheesy Bburinkle seasoning.'),
('88888888-8888-8888-8888-888888888888', 3000, 6, '콘치즈 호떡', '톡톡 터지는 옥수수와 쭉 늘어나는 치즈가 가득한 고소한 호떡', 'Corn Cheese Hotteok', 'Hotteok filled with sweet corn and stretchy cheese.'),
('99999999-9999-9999-9999-999999999999', 3000, 7, '고구마 치즈 호떡', '달콤하고 부드러운 고구마에 고소한 치즈를 더한 달달한 호떡', 'Sweet Potato Cheese Hotteok', 'Sweet, soft sweet potato with savory cheese.'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3000, 8, '흑임자 콩가루 호떡', '고소한 콩가루와 진한 흑임자가루를 듬뿍 입힌 고소달달 호떡', 'Black Sesame Soybean Powder Hotteok', 'Sweet hotteok coated in soybean and black sesame powders.'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3500, 9, '불닭 콘치즈 호떡', '고소한 콘치즈에 매콤한 불닭소스와 불닭 마요를 더한 화끈한 호떡 🔥', 'Buldak Corn Cheese Hotteok', 'Corn cheese hotteok with spicy Buldak sauce and mayo.'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 3500, 10, '말차 화이트초코 호떡', '쌉싸름한 말차와 달콤하고 부드러운 화이트초코가 어우러진 달콤쌉싸름 호떡', 'Matcha White Chocolate Hotteok', 'Bittersweet matcha with sweet, creamy white chocolate.');

INSERT INTO public.menu_items (id, base_price, stock, is_sold_out_manual, is_active, sort_order)
SELECT id, price, 100, false, true, position FROM t36_menu_seed
ON CONFLICT (id) DO UPDATE SET base_price = EXCLUDED.base_price, sort_order = EXCLUDED.sort_order;
INSERT INTO public.menu_item_translations (menu_item_id, locale, name, description)
SELECT id, 'ko', name_ko, description_ko FROM t36_menu_seed
UNION ALL SELECT id, 'en', name_en, description_en FROM t36_menu_seed
ON CONFLICT (menu_item_id, locale) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 서로 다른 추가 옵션은 모두 선택 가능하되 동일 옵션을 두 번 고를 수 없다.
CREATE TEMP TABLE t36_option_seed (
 group_key text, group_order integer, group_ko text, group_en text,
 option_key text, option_order integer, option_ko text, option_en text, price integer
) ON COMMIT DROP;
INSERT INTO t36_option_seed VALUES
('seasoning', 1, '시즈닝 추가', 'Extra Seasoning', 'honey_butter', 1, '허니버터', 'Honey Butter', 500),
('seasoning', 1, '시즈닝 추가', 'Extra Seasoning', 'cheddar', 2, '체다치즈', 'Cheddar Cheese', 500),
('seasoning', 1, '시즈닝 추가', 'Extra Seasoning', 'consomme', 3, '콘소메', 'Consomme', 500),
('seasoning', 1, '시즈닝 추가', 'Extra Seasoning', 'bburinkle', 4, '뿌링클', 'Bburinkle', 500),
('seasoning', 1, '시즈닝 추가', 'Extra Seasoning', 'matcha', 5, '말차', 'Matcha', 500),
('seasoning', 1, '시즈닝 추가', 'Extra Seasoning', 'soybean', 6, '콩가루', 'Soybean Powder', 500),
('seasoning', 1, '시즈닝 추가', 'Extra Seasoning', 'black_sesame', 7, '흑임자가루', 'Black Sesame Powder', 500),
('sauce', 2, '소스 추가', 'Extra Sauce', 'mayo', 1, '마요', 'Mayo', 300),
('sauce', 2, '소스 추가', 'Extra Sauce', 'buldak_sauce', 2, '불닭 소스', 'Buldak Sauce', 500),
('sauce', 2, '소스 추가', 'Extra Sauce', 'buldak_mayo', 3, '불닭 마요', 'Buldak Mayo', 700);

-- 결정적인 UUID로 재실행해도 그룹·옵션이 중복되지 않는다.
INSERT INTO public.option_groups (id, menu_item_id, min_select, max_select, sort_order, is_active)
SELECT DISTINCT md5(m.id::text || ':' || o.group_key)::uuid, m.id, 0,
 CASE WHEN o.group_key = 'seasoning' THEN 7 ELSE 3 END, o.group_order, true
FROM t36_menu_seed m CROSS JOIN t36_option_seed o
ON CONFLICT (id) DO UPDATE SET min_select = EXCLUDED.min_select,
 max_select = EXCLUDED.max_select, sort_order = EXCLUDED.sort_order;
INSERT INTO public.option_group_translations (option_group_id, locale, name)
SELECT DISTINCT md5(m.id::text || ':' || o.group_key)::uuid, 'ko', o.group_ko
FROM t36_menu_seed m CROSS JOIN t36_option_seed o
UNION ALL
SELECT DISTINCT md5(m.id::text || ':' || o.group_key)::uuid, 'en', o.group_en
FROM t36_menu_seed m CROSS JOIN t36_option_seed o
ON CONFLICT (option_group_id, locale) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.options (id, option_group_id, extra_price, sort_order, is_active)
SELECT md5(m.id::text || ':' || o.group_key || ':' || o.option_key)::uuid,
 md5(m.id::text || ':' || o.group_key)::uuid, o.price, o.option_order, true
FROM t36_menu_seed m CROSS JOIN t36_option_seed o
ON CONFLICT (id) DO UPDATE SET extra_price = EXCLUDED.extra_price,
 sort_order = EXCLUDED.sort_order;
INSERT INTO public.option_translations (option_id, locale, name)
SELECT md5(m.id::text || ':' || o.group_key || ':' || o.option_key)::uuid, 'ko', o.option_ko
FROM t36_menu_seed m CROSS JOIN t36_option_seed o
UNION ALL
SELECT md5(m.id::text || ':' || o.group_key || ':' || o.option_key)::uuid, 'en', o.option_en
FROM t36_menu_seed m CROSS JOIN t36_option_seed o
ON CONFLICT (option_id, locale) DO UPDATE SET name = EXCLUDED.name;
COMMIT;
