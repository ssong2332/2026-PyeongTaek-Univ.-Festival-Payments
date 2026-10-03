# T-36 확정 메뉴 적용

2026-10-03 전달된 메뉴 10종과 추가 옵션 9종을 `supabase/seed.sql`에 반영한다. 한국어 이름·설명·가격은 전달된 내용 그대로이며, 영어 문구는 시드용 번역이다.

## 기존 운영 데이터

- 기존 기본·뿌링클 메뉴는 ID를 유지한다. 재고·수동 품절·활성 상태는 시드 재실행 시 유지된다.
- 기존 불닭 치즈·맛다시 메뉴는 주문 참조와 재고를 유지한 채 최초 재실행에서만 비활성화한다. 새로운 불닭 콘치즈 메뉴에는 새 ID를 사용한다.
- 신규 8종은 최초 재고 100개로 생성한다(DECISIONS #50). 운영 중 변경된 재고를 시드 재실행으로 복구하지 않는다.
- 모든 메뉴에 선택 사항인 시즈닝 그룹(7종 중 최대 1종)과 불닭 소스·불닭 마요 그룹(각 최대 1개)을 둔다. 추가 가격은 항목당 500원이다.

## 적용 및 확인

운영 DB의 시드 적용·확인은 DB1 담당이다(DECISIONS #47). 이 PR 병합 후 DB1이 최신 `dev`의 `supabase/seed.sql`을 기존 운영 절차대로 적용한다. 적용 전 기존 4종 메뉴의 재고·상태와 주문 참조를 기록하고, 적용 후 다음을 확인한다.

```sql
SELECT count(*) AS active_menus FROM public.menu_items WHERE is_active;
SELECT t.name, m.base_price, m.stock, m.is_active, m.sort_order
FROM public.menu_items m
JOIN public.menu_item_translations t ON t.menu_item_id = m.id AND t.locale = 'ko'
ORDER BY m.sort_order, t.name;
SELECT count(*) AS active_groups FROM public.option_groups WHERE is_active;
SELECT count(*) AS active_options FROM public.options WHERE is_active;
```

기존 두 메뉴가 아직 활성이고 나머지 운영 상태가 바뀌지 않았다면 활성 메뉴 10개, 신규 옵션 그룹 30개, 신규 옵션 90개가 예상된다. 운영자가 개별 메뉴나 옵션을 비활성화했다면 활성 개수 대신 전체 개수와 해당 운영 상태를 확인한다. 자동 검증은 CI의 `tests/integration/seed.sql`에서 신규 DB·재실행·구 시드 전환을 각각 수행한다.
