# T-08 멱등키·픽업 번호·상태 토큰 — 선작업 검증

> **현황(2026-09-26): 구현·검증 완료, PR 제출(T-07과 같은 PR).** 선행 T-07 완료, `create_order`(0010, PR #42)로 실제 검증. 상태 전환은 팀장 판단.
> 픽업 번호(counters)·토큰(`gen_random_bytes`)·멱등 처리(UNIQUE·unique_violation 재조회)의 본체는 `create_order`(DB1 서동혁, ADR-0002). BE1 몫은 API 쪽 멱등키 선조회와 응답, 그리고 완료 기준 통합 테스트다.
> T-07과 같은 파일·같은 DB 함수를 쓰므로 **`feat/T-07-create-order` 브랜치에서 함께 작업하고 같은 PR로 올린다.**

## 멱등키 선조회 (2026-09-25, 커밋 3cee3d0)

- `orderService.createOrder`가 `repo.findByIdempotencyKey`로 먼저 찾고, 있으면 `create_order`를 부르지 않고 기존 주문(`created=false` → Route 200)을 돌려준다(ADR-0009 ①). 선조회와 생성 사이의 동시 재요청은 `create_order`가 `created=false`로 처리한다(ADR-0002 7번).
  - 속도 제한(T-51 ②)은 ①과 ③ 사이에 들어갈 자리 — 멱등 재요청은 한도를 쓰지 않는다.
- `supabaseOrderRepository.findByIdempotencyKey`: `orders`에서 `idempotency_key`로 조회 → `mappers.toExistingOrderResponse`(현재 상태 그대로, `created=false`).
- 테스트(실패 확인 후 구현): 서비스 단위(선조회 적중 시 create_order 미호출·동시 재요청 결과 사용), Route 단위(선조회 적중 → 200·rpc 미호출), 통합 `tests/integration/supabaseOrderRepository.idempotency.test.ts` 2개(실제 로컬 DB — 있으면 created=false 응답, 없으면 null).

## 완료 기준 통합 테스트 선작성 (2026-09-25, 커밋 bccd673)

`tests/integration/createOrder.test.ts`의 T-08 블록 5개 — Tasks T-08 단위 테스트 항목 그대로:
- 같은 키 2회 → 주문 1건·같은 주문 ID·픽업 번호·토큰·재고 1회 차감
- 같은 키 동시 2회 → 주문 1건·재고 1회·같은 번호
- 날짜와 무관하게 번호 이어짐 150 → 151 → 152 (PRD F-09)
- 동시 생성 5건 → 번호 중복 없이 연속
- 토큰 64자 16진수·주문마다 다름 (PRD F-10)

`create_order`가 없으면 skip. **실제 함수로는 아직 실행하지 않았다.**

## 검증 (2026-09-25, Node 20.20.2)

`npm run test` 170개, `npm run test:integration` 3 통과·11 skip, `typecheck`·`lint`·`build` 통과.

## 요구사항 대응 (DoD — PRD ID ↔ 구현·검증)

| ID | 요구·승인 기준(PRD) | 구현 위치 | 검증 |
|---|---|---|---|
| F-08 | 같은 멱등키 재요청은 새 주문 없이 기존 주문 반환, 두 응답 같은 주문 ID·픽업 번호, 재고 1회 차감 | `orderService` ① 선조회(`findByIdempotencyKey`) → 있으면 200 · 동시 재요청은 create_order가 created=false | `orderService.test.ts`·Route 단위(선조회 적중 시 rpc 미호출) · `idempotency.test.ts`(실제 DB) · `createOrder.test.ts`(2회·동시 2회) · 실제 호출 200(같은 ID·번호·토큰) |
| F-09 | 연속 픽업 번호, 두 주문에 같은 번호 없음, 150 → 151 (날짜 리셋 없음) | create_order(counters) · 응답 `pickupNumber` | `createOrder.test.ts`(150→151→152 · 동시 5건 중복 없음) · 응답 스키마(양의 정수) |
| F-10 | 주문 생성 시 추측 불가 토큰 발급(상태 페이지 URL용) | create_order(`gen_random_bytes(32)`) · 응답 `statusToken` | `createOrder.test.ts`(64자 16진수·중복 없음) · 응답 스키마(64자 16진수). **토큰으로 조회하는 페이지·API는 T-11(유은조) 범위** |
| N-01 | 멱등키 UNIQUE + 단일 트랜잭션, 중복 주문 0건 | DB(UNIQUE, 0001) + create_order · API 선조회 | `createOrder.test.ts` 동시 재요청 → 주문 1건 |

## 최종 검증 (2026-09-26, 최신 dev beb21db — 0010 포함)

- `createOrder.test.ts` T-08 블록 5개 skip 없이 통과: 같은 키 2회(주문 1건·같은 ID·번호·토큰·재고 1회) · 같은 키 동시 2회 · 픽업 번호 150→151→152 · 동시 5건 번호 중복 없음 · 토큰 64자 16진수·중복 없음
- 실제 호출(로컬 DB): 같은 키 재요청 → 200, 첫 응답과 같은 orderId·pickupNumber·statusToken, `created:false`
- 전체: 단위 179 · 통합 46 · typecheck·lint·build 통과(응답 스키마 추가 후 재확인)

## 남은 일 (T-08)

- [x] T-07 완료(0010 병합) 후 T-08 블록 5개 실제 실행·통과 (2026-09-26)
- [ ] 상태 페이지 토큰 조회 API(`GET /api/orders/{token}`)는 T-11(BE2) 몫 — 여기서 만들지 않음
- [ ] T-07·T-08 함께 PR — QA 1차·팀장 판단 대기
