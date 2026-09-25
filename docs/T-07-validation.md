# T-07 주문 생성 API — 선작업 검증

2026-09-24 작성. 선행(T-03·T-53, `create_order` 함수 — 서동혁)이 끝나지 않아 **계약(Architecture "고객 주문 생성"·"6. 고객 API", ADR-0002) 기준 선작업**만 했다. Tasks 상태는 바꾸지 않는다.

- `src/lib/dto/order.ts`: `CreateOrderRequestSchema`(zod strict — 가격·`transferMethod` 등 모르는 필드는 400), `CreateOrderResponse` 타입.
  - 결제수단 `cash`·`transfer`만, 수량 1..99 정수, 항목 1..20개, ID는 uuid, 언어 `ko`·`en`(T-04에서 `SUPPORTED_LOCALES`로 옮김).
- `src/services/orderService.ts`의 `createOrder`: 검증된 요청을 `repo.createOrder`(rpc `create_order`)에 넘기고 결과를 그대로 돌려준다. 가격 재계산·재고 차감·롤백은 DB 함수 몫(ADR-0002). 멱등키 선조회(T-08)·속도 제한(T-51)은 각 Task에서 앞에 추가.
- `src/services/ports.ts`: `OrderRepository.createOrder` 추가. 서비스는 필요한 메서드만 `Pick`으로 받는다.
- `zod`를 직접 의존성으로 추가(기존엔 eslint 플러그인을 통한 간접 설치뿐이었다).
- 테스트: `tests/unit/lib/dto/order.test.ts`(허용 외 결제수단·가격 필드·수량·항목 수·uuid·언어), `tests/unit/services/orderService.test.ts`(repo 전달, 멱등 재요청 결과, 409 에러 전달).
- 모듈 없음으로 실패 확인 후 구현. `npm run test` 132개, `typecheck`·`lint`·`build` 통과.

남은 일(선행 완료 후): Supabase 저장소 구현체(rpc 호출 + `OUT_OF_STOCK`·`MENU_UNAVAILABLE`·`INVALID_OPTION` → 409 변환), Route Handler `POST /api/orders`(201/200), `create_order` 통합 테스트(조작 가격 무시·옵션 추가 가격 합산·동시 주문 재고 음수 방지·롤백). `AppError(code, httpStatus, details?)` 규격 확정(PR #31) — Route Handler·저장소는 이 규격으로 작성한다. 응답 변환(`toErrorResponse`·`withHandler`)은 유은조 T-33 브랜치에 있으니 병합 후 재사용.

## 저장소 구현체 (2026-09-24)

- `src/infra/repositories/supabaseOrderRepository.ts`의 `createSupabaseOrderRepository(client).createOrder`: `rpc('create_order', { p_idempotency_key, p_payment_method, p_locale, p_items })` (ADR-0002 인자 이름).
  - DB 예외 → `AppError`: `OUT_OF_STOCK`·`MENU_UNAVAILABLE`·`INVALID_OPTION` 409, `EMPTY_ITEMS` 400 `VALIDATION_ERROR`.
  - 예외의 `DETAIL`이 JSON 문자열이면 `details`로 넘긴다. **`create_order` 작성자(서동혁)와 형식 합의 필요** — API 규격은 `OUT_OF_STOCK` = `[{menuItemId, requested, available}]`, `MENU_UNAVAILABLE` = `{menuItemId}`.
  - 그 밖의 DB 에러·계약과 다른 결과 모양은 일반 `Error`로 던진다(`withHandler`가 기록하고 500으로 숨김 — Architecture "예외를 잡는 위치").
- `src/infra/repositories/mappers.ts`의 `toCreateOrderResponse`: 필드 명시 매핑, `createdAt`을 UTC ISO(`...Z`)로 맞춤.
- `tests/unit/infra/repositories/supabaseOrderRepository.test.ts` 11개(가짜 rpc 클라이언트). 모듈 없음으로 실패 확인 후 구현. `npm run test` 143개, `typecheck`·`lint` 통과.
- 실제 DB 확인은 `create_order`가 나온 뒤 통합 테스트로 한다.

## Route Handler `POST /api/orders` (2026-09-25)

- `src/app/api/orders/route.ts`: 본문 JSON → `CreateOrderRequestSchema.safeParse` → 실패 시 `AppError("VALIDATION_ERROR", 400, issues)` → `orderService.createOrder` → `created`면 201, 멱등 재요청이면 200.
  - JSON이 아닌 본문도 400 `VALIDATION_ERROR`(500이 되지 않게 `request.json()` 실패를 검증 실패로 처리).
  - 에러 봉투·로그는 T-33의 `withHandler`·`toErrorResponse` 재사용. `withHandler`가 요청을 넘기지 않아 공용 파일(`handler.ts`)은 고치지 않고 요청마다 감싸서 `request`를 쓴다.
  - 속도 제한(T-51, ADR-0009 ②)과 멱등키 선조회(T-08, ①)는 아직 없다.
- `tests/unit/api/ordersRoute.test.ts` 7개(201·200·가격 필드 400·허용 외 결제수단 400·JSON 아님 400·재고 부족 409 봉투·알 수 없는 DB 에러 500 비노출). rpc만 가짜.
- 모듈 없음으로 7개 실패 확인 후 구현. `npm run test` 166개, `typecheck`·`lint`·`build` 통과.
