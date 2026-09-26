# T-07 주문 생성 API — 선작업 검증

> **현황(2026-09-26): 구현·검증 완료, PR 제출.** 선행 T-53(0008)·`create_order`(0010, PR #42) dev 병합 확인 후 최신 dev를 합쳐 실제 함수로 검증했다. 상태 전환(검증중·완료)은 팀장 판단.
> T-08(멱등키·픽업 번호·토큰)은 같은 파일·같은 DB 함수를 쓰므로 **같은 브랜치(`feat/T-07-create-order`)·같은 PR**로 올린다 — 기록은 `docs/T-08-validation.md`.

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

## 상태 값 버그 수정 · create_order 통합 테스트 선작성 (2026-09-25)

- **버그 수정**: `CreateOrderResponse.status`가 `"pending"`으로만 고정돼 있어, 이미 결제확인된 주문을 같은 멱등키로 다시 요청하면 500이 났다 → `OrderStatus` 전체 허용(알 수 없는 값은 여전히 거부). 저장소 단위 테스트 2개(paid 허용·알 수 없는 상태 거부) 실패 확인 후 수정.
- **`tests/integration/createOrder.test.ts`** 중 T-07 블록 6개: 서버 가격 계산((기본가+옵션)×수량)·동시 주문 재고 음수 방지·롤백(주문·재고·픽업 번호 그대로)·품절 409·다른 메뉴 옵션 409·생성 이력 1행. (같은 파일의 T-08 블록 5개는 `T-08-validation.md`)
  - `create_order`가 없으면(PGRST202 — 로컬에서 확인) 파일 전체 skip, 0010이 들어오면 자동 실행.
  - **실제 함수로는 아직 한 번도 돌려보지 않았다** — 0010 병합 후 결과를 보고 테스트·함수 중 어느 쪽을 고칠지 서동혁과 확인.

## create_order(0010, PR #42) 대조 (2026-09-25 저녁)

- 서동혁 PR #42(`feat/T-07-create-order-db`)를 임시 공간에서 T-07 브랜치에 합쳐 실행: 0001→0003→0007→0008→0009→0010 적용, **`createOrder.test.ts` 11개 전부 통과(skip 0)**, 통합 전체 46 통과.
- 에러·DETAIL 형식 계약과 일치(OUT_OF_STOCK `[{menuItemId, requested, available}]` 등). 0010에 새로 있는 `INVALID_ITEMS`(항목 형식 오류)를 400 `VALIDATION_ERROR`로 변환 추가 — 단위 테스트 실패 확인 후 구현.

## 요구사항 대응 (DoD — PRD ID ↔ 구현·검증)

| ID | 요구·승인 기준(PRD) | 구현 위치 | 검증 |
|---|---|---|---|
| F-06 | 결제수단 현금/계좌이체 중 선택, 미선택 시 주문 안 됨, 선택값 저장 | `lib/dto/order.ts`(`paymentMethod` 필수·cash/transfer만) · 저장은 create_order(0010) | `order.test.ts`(누락·kakaopay·toss·card 400) · Route 400 · 저장은 `t07-create-order.sql`(DB1, transfer 저장 확인) |
| F-07 | 서버가 ID·수량만 받아 가격 재계산, 주문·항목·재고 차감 단일 트랜잭션, 동시 주문 재고 음수 없음, 실패 시 전부 롤백 | `lib/dto/order.ts`(가격 필드 없음) · `orderService`·`supabaseOrderRepository.createOrder` → create_order | `createOrder.test.ts` T-07 블록(가격 재계산·동시 2건·롤백·품절·잘못된 옵션·이력) · 실제 호출 201(서버 계산 6,000원) |
| F-07 (#45 결정) | 요청 규격에 없는 가격 필드(`totalAmount`, `price` 등)가 포함되면 400 `VALIDATION_ERROR`, 주문 생성·재고 차감 없음 — 2026-09-26 팀장 결정(GitHub #45 "현재 400 거부 방식을 유지"), PRD·Architecture·Tasks 문구는 PR #53에서 현행화 | `lib/dto/order.ts`(zod strict — 모르는 필드 400) · Route가 검증 실패 시 서비스·DB를 호출하지 않음 | `order.test.ts`(가격 필드 400) · `ordersRoute.test.ts` "가격 필드가 들어오면 400 VALIDATION_ERROR, DB는 호출하지 않는다" · 실제 호출 400. 코드 변경 없음 |
| N-02 | 동시 주문에서도 재고 음수 불가 | create_order(행 잠금) | `createOrder.test.ts` "재고 1개에 동시 주문 2건 → 1건만" |
| N-03 | 가격은 서버만 계산, 클라이언트 가격 저장·사용 안 함 | 요청 DTO에 가격 필드 자체가 없음 · 응답 `totalAmount`는 DB 결과 | `order.test.ts` 가격 필드 거부 · `createOrder.test.ts` 서버 계산 |
| (API 계약) | `CreateOrderResponse` 모양 | `CreateOrderResponseSchema`(zod, 프론트·백 공용) · `mappers.toCreateOrderResponse`가 같은 스키마로 검사 | `order.test.ts` 응답 스키마 7개 · 저장소 단위(모양 어긋나면 500) |

## 최종 검증 (2026-09-26, 최신 dev beb21db 병합 — 마이그레이션 0001·0003·0007·0008·0009·0010)

- `npm run test` 179 통과(응답 스키마 추가 후) · `npm run test:integration` 46 통과(**`createOrder.test.ts` 11개 skip 없이 전부 통과**) · `typecheck` 0 · `lint` 0 · `build` 통과(`ƒ /api/orders`)
- T-07 완료 기준(Tasks, #45 결정 반영): 가격 필드 포함 요청 400 `VALIDATION_ERROR`·주문 생성/재고 차감 없음 ✅ · 정상 요청 서버 가격 계산 ✅ · 옵션 추가 가격 합산 ✅ · 동시 주문 재고 음수 방지 ✅ · 롤백(주문·재고·픽업 번호) ✅ · 허용 외 결제수단 거부 ✅
- 실제 호출(로컬 Supabase에 연결한 `next dev` — 운영 DB 미사용): 새 주문 201(서버 계산 6,000원·픽업 번호·64자 토큰) · 같은 키 재요청 200(같은 ID·번호·토큰, created=false) · 재고 부족 409 + details `[{menuItemId, requested:1, available:0}]` · 가격 필드 400 · kakaopay 400

## 남은 일 (T-07)

- [x] 0008·0010 dev 병합 후 최신 dev 병합 → `createOrder.test.ts` 실제 실행·통과 (2026-09-26)
- [x] `supabaseOrderRepository.ts`·`mappers.ts` 두 벌(T-14·T-07) 합치기 — 2026-09-25 T-14 브랜치(d432d38)를 병합하며 한 파일로(에러 표 `DB_ERRORS`에 create_order·transition_order 코드 함께). 단위 171·통합 26 통과(create_order 11 skip)·typecheck·lint·build 통과. #36이 리뷰로 바뀌면 다시 병합
- [x] T-07·T-08 함께 PR #46 (base dev) 제출 (2026-09-26) — QA 1차 확인 완료, #45 결정(400 유지)으로 최종 승인·팀장 병합 대기
- 범위 밖: 속도 제한(T-51, BE2) — `orderService`의 ①과 ③ 사이 자리만 비워 둠
