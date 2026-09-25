# T-08 멱등키·픽업 번호·상태 토큰 — 선작업 검증

> **현황(2026-09-25): 미완료 — 선작업 단계.** 선행 **T-07이 아직 미완료**(create_order 0010 미병합)라 T-08도 연결·검증 전이다. Tasks 상태는 바꾸지 않는다.
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

## 남은 일 (T-08)

- [ ] T-07 완료(0010 병합) 후 T-08 블록 5개 실제 실행·통과
- [ ] 상태 페이지 토큰 조회 API(`GET /api/orders/{token}`)는 T-11(BE2) 몫 — 여기서 만들지 않음
- [ ] T-07·T-08 함께 PR
