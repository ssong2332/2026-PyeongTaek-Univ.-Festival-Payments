# T-28 수기 주문 사후 입력 — 저장 API·DB 함수·마이그레이션 검증 기록 (BE1)

> **현황(2026-10-06): BE1 범위 구현·로컬 검증 완료.** 범위는 팀장 지시(2026-10-06, DECISIONS #62)의 5항목 — 마이그레이션 0104, 원자적 DB 함수, `POST /api/admin/manual-orders`, 통계·CSV 날짜 기준, 실제 DB 통합 테스트. 화면 연결(#98)은 FE2(김 혁), 운영 DB 적용은 DB1(서동혁) 몫이다. Tasks 상태는 바꾸지 않는다.

## 팀장 확인 사항 (2026-10-06)

| 항목 | 결정 |
|---|---|
| 수기 주문 번호 | 기존 `pickup_number` 규칙은 그대로 두고 수기 전용 번호 칸을 0104에 추가. DB에는 숫자, 화면·CSV는 `M-001` 형식 |
| 번호 부여 | 자동 발급이 아니라 **종이에 적힌 M 번호를 직접 입력**(T-30 폴백에서 현장이 이미 M-001…을 부여). 화면은 `M-` 고정·숫자만 입력해도 됨 |
| 중복 | DB에서 막는다 |
| 범위 | 축제 전체 기간 연속, M-001부터. 기존 픽업 번호 체계에 영향 없음 |

## 만든 것

| 파일 | 내용 |
|---|---|
| `supabase/migrations/0104_manual_orders.sql` | `orders.source`·`manual_ordered_at`·`manual_number`(UNIQUE, 1..9999) + CHECK, DB 함수 `create_manual_order`, `get_stats` 날짜 기준 변경 |
| `src/lib/dto/manualOrder.ts` | 요청·응답 계약(`ManualOrderRequestSchema` — #98 초안 + `manualNumber`) |
| `src/services/manualOrderService.ts` · `src/services/ports.ts` | 미래 시각 차단, 관리자 id 전달, `ManualOrderRepository` |
| `src/infra/repositories/supabaseManualOrderRepository.ts` | DB 함수 호출, 실패 코드 → API 오류, 응답 모양 검사 |
| `src/app/api/admin/manual-orders/route.ts` | `requireAdmin` → strict 검증 → 201(신규)/200(재요청) |
| `src/domain/order/manualNumber.ts` | `formatManualNumber(1) = "M-001"` |
| `src/infra/repositories/csvOrderRepository.ts` · `src/domain/stats/csv.ts` (T-22, 김 혁 작성분 수정) | 날짜 범위·"주문 시각"을 종이 시각 기준으로, "픽업 번호" 열에 `M-001` |
| `src/lib/dto/adminOrder.ts` · `src/infra/repositories/adminOrderRepository.ts` | `AdminOrderDto`에 `source`·`manualNumber`·`manualOrderedAt`(선택 필드) — #98이 "수기 입력" 표시에 사용 |
| `src/lib/api/errors.ts` | 오류 코드 `MANUAL_NUMBER_TAKEN` 추가 |
| `docs/Architecture.md` | 2-1 번호표 0104 행(별도 선행 커밋), 함수 표·데이터 모델·관리자 API 표 |

## 동작 요약

- **저장**: 완료(`completed`) 상태로 바로 저장한다. `paid_at`·`completed_at`은 종이 주문 시각, `created_at`은 입력 시각. 미확인 강조가 뜨지 않게 확인 처리(`acknowledged_at`·`acknowledged_by`)까지 한다. 상태 이력 1행(`NULL → completed`, `manual_create`, `admin`, 관리자 id).
- **가격**: 요청에 가격이 없다(strict라 들어오면 400). DB의 메뉴·옵션 가격으로 스냅샷을 만든다.
- **재고**: `greatest(stock - 수량, 0)`. 모자라도 저장하고 응답 `stockShortages`로 알려 준다(화면 경고용).
- **메뉴·옵션**: 종이 주문은 이미 판 것이라 비활성·수동 품절 메뉴와 판매 중지된 옵션도 받는다. 없는 메뉴, 다른 메뉴의 옵션, 중복, 그룹 최대 선택 초과, 판매 중인 그룹의 최소 선택 미달은 거부한다.
- **멱등**: 같은 `idempotencyKey` 재요청은 같은 주문을 `created=false`(200)로 돌려준다. 고객 주문 생성(`create_order`)과 같은 잠금 키를 쓴다. 고객 주문에 쓰인 키면 400.
- **수기 번호**: 요청의 `manualNumber`(1..9999)를 그대로 저장한다. 같은 번호의 다른 요청은 409 `MANUAL_NUMBER_TAKEN`(번호별 잠금 + UNIQUE). `pickup_number`(NOT NULL·UNIQUE·양수)는 고객 번호와 겹치지 않는 `2100000000 + manualNumber`로 채우고, 고객 픽업 번호 카운터는 건드리지 않는다.
- **통계·CSV 날짜**: 수기 주문은 `manual_ordered_at`, 그 밖은 `created_at`. `get_stats`와 CSV가 같은 조건을 쓴다.

## 요구사항 대응 (팀장 지시 ①~⑤)

| 지시 | 검증 (`tests/integration/t28-manual-orders.test.ts` 23개 — 실제 DB, mock 없음) |
|---|---|
| ① `source`·`manual_ordered_at` 추가, 번호 0104 | 저장된 행의 `source='manual'`·`manual_ordered_at`·`manual_number` 확인. 고객 주문은 `customer`·NULL |
| ② 원자적 DB 함수: 완료 주문 + 출처 + 종이 시각 + 이력 + 재고 | 현금·계좌이체 각각 주문 행·항목 스냅샷·옵션·이력 1행·재고 10 → 8. 없는 메뉴가 섞이면 아무것도 저장되지 않음 |
| ② 재고가 모자라도 저장, 0에서 멈춤 | 재고 1에 3개 → 저장·재고 0·부족 내역 반환 / 재고 0 → 저장·재고 0 / 같은 메뉴 여러 줄은 합계로 한 번 차감 |
| ③ 인증된 API, 입력은 `ManualOrderRequestSchema` | 라우트 단위 17개: 미인증은 본문과 무관하게 401·서비스 미호출, strict·가격 필드·번호·시각 형식 400, 201/200 |
| ③ 가격은 DB 기준 | 총액이 DB 가격으로 계산됨. 저장 뒤 메뉴 가격을 바꿔도 재요청 응답의 총액은 그대로 |
| ③ 같은 멱등키 재요청 = 같은 주문, 중복 금지 | 순차 3회(내용이 달라도)·동시 5회 모두 주문 1건·재고 1회 차감·이력 1행 |
| ④ 통계·CSV 날짜는 `manual_ordered_at` 기준 | 2001-01-05의 종이 주문을 오늘 입력 → `get_stats('2001-01-05')`에 잡히고 오늘 매출·건수는 그대로. KST 자정 경계(14:59:59Z / 15:00:00Z). CSV도 그 날짜 범위에만 포함, "주문 시각"은 종이 시각, 번호는 `M-`. 고객 주문은 `created_at` 날짜 그대로 |
| ⑤ 동작을 바꾸는 mock 없음 | 통합 테스트는 `createManualOrder` → 실제 저장소 → 실제 DB 직접 호출(DECISIONS #46). 인증 경계는 단위 테스트 |
| 수기 번호(10-06 확인) | 같은 번호의 다른 요청 409·주문·재고 불변 / 동시 4건 중 1건만 저장 / 고객 픽업 카운터 불변·다음 고객 번호가 그대로 이어짐 / 범위 밖 번호 400 |
| 권한 | anon 역할은 DB 함수 실행 불가 |

단위 테스트: 요청 규격 23개 · 서비스 6개 · 저장소 오류 변환 10개 · 라우트 17개 · CSV 1개 추가.

## 검증 (2026-10-06, Node 22.23.3, 로컬 Supabase — dev fe6048c, 마이그레이션 0001~0019·0100~0104)

- `npm run test` 1193 통과 · `npm run test:integration` 226 통과(T-28 23개 포함) · `typecheck` 0 · `build` 통과 · `lint` 오류 0(경고 1건은 기존 `src/app/api/admin/settings/route.ts` — 이 PR과 무관)
- 운영 DB는 사용하지 않았다(로컬 DB만).
- Red-First: 0104를 적용하기 전 DB에서 통합 테스트 23개 중 21개가 "함수 없음"으로 실패하는 것을 확인한 뒤 적용했다(나머지 2개는 고객 주문 날짜·권한 거부라 적용 전에도 성립).
- 일부러 망가뜨려 실패 확인(모두 원복, DB 함수는 본문 조회로 확인):
  - 재고를 0에서 멈추지 않게 함 → 재고 테스트 2개 실패
  - `get_stats`를 `created_at` 기준으로 되돌림 → 통계 날짜 테스트 2개 실패
  - CSV 조회를 `created_at` 기준으로 되돌림 → CSV 테스트 1개 실패
  - 서비스가 관리자 id를 넘기지 않게 함 → 통합 3개·단위 1개 실패
  - 라우트에서 인증을 뺌 → 라우트 단위 2개 실패

## 연결·운영 시 확인할 것 (이 PR 범위 밖)

- **#98 화면(김 혁)**: 입력 형식에 `manualNumber`(숫자)가 추가됐다 — 화면에 M 번호 입력 칸이 필요하다. 계약 원본은 `src/lib/dto/manualOrder.ts`(#98의 `ManualOrderRequestSchema`는 이 파일을 import하도록 정리). 409 `MANUAL_NUMBER_TAKEN` 안내, `stockShortages` 경고 표시, 목록의 "수기 입력"·`M-001` 표시(`AdminOrderDto.source`·`manualNumber`)도 화면 몫이다. 화면이 연결되기 전에는 대시보드가 수기 주문의 픽업 번호를 `2100000001`처럼 보여 준다.
- **운영 DB(서동혁)**: 0103 다음에 0104 적용. `orders`에 칸 3개·제약 4개·인덱스 1개 추가, 함수 1개 신설, `get_stats` 교체(권한 유지). 기존 주문은 `source='customer'`.
- **T-26 히트맵(#136, 김 혁 Draft)** 등 `created_at`으로 날짜를 나누는 새 집계가 있으면 같은 기준(`manual_ordered_at`)을 적용해야 한다.
- 대시보드 "오늘 주문" 목록은 입력 시각(`created_at`) 기준 그대로다 — 수기 주문은 입력한 날 목록의 완료 칸에 보인다.

## 한계

- 같은 멱등키로 **다른 내용**을 다시 보내면 처음 저장한 주문을 돌려준다(고객 주문 생성과 같은 동작). 잘못 입력한 수기 주문을 고치는 기능은 없다 — 필요하면 환불·취소 흐름과 별도로 정해야 한다.
- 재요청 응답의 `stockShortages`는 빈 배열이다(처음 저장할 때의 부족 내역은 다시 계산하지 않는다).
- 수기 번호는 1..9999다. 종이에 같은 번호를 두 번 쓴 경우 두 번째는 409로 거부되므로 현장에서 번호를 정리해 다시 입력해야 한다.
- 종이 주문 시각의 과거 한계는 두지 않았다(미래만 5분 여유로 막는다).
