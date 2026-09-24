# T-07 주문 생성 API — 선작업 검증

2026-09-24 작성. 선행(T-03·T-53, `create_order` 함수 — 서동혁)이 끝나지 않아 **계약(Architecture "고객 주문 생성"·"6. 고객 API", ADR-0002) 기준 선작업**만 했다. Tasks 상태는 바꾸지 않는다.

- `src/lib/dto/order.ts`: `CreateOrderRequestSchema`(zod strict — 가격·`transferMethod` 등 모르는 필드는 400), `CreateOrderResponse` 타입.
  - 결제수단 `cash`·`transfer`만, 수량 1..99 정수, 항목 1..20개, ID는 uuid, 언어 `ko`·`en`(T-04에서 `SUPPORTED_LOCALES`로 옮김).
- `src/services/orderService.ts`의 `createOrder`: 검증된 요청을 `repo.createOrder`(rpc `create_order`)에 넘기고 결과를 그대로 돌려준다. 가격 재계산·재고 차감·롤백은 DB 함수 몫(ADR-0002). 멱등키 선조회(T-08)·속도 제한(T-51)은 각 Task에서 앞에 추가.
- `src/services/ports.ts`: `OrderRepository.createOrder` 추가. 서비스는 필요한 메서드만 `Pick`으로 받는다.
- `zod`를 직접 의존성으로 추가(기존엔 eslint 플러그인을 통한 간접 설치뿐이었다).
- 테스트: `tests/unit/lib/dto/order.test.ts`(허용 외 결제수단·가격 필드·수량·항목 수·uuid·언어), `tests/unit/services/orderService.test.ts`(repo 전달, 멱등 재요청 결과, 409 에러 전달).
- 모듈 없음으로 실패 확인 후 구현. `npm run test` 132개, `typecheck`·`lint`·`build` 통과.

남은 일(선행 완료 후): Supabase 저장소 구현체(rpc 호출 + `OUT_OF_STOCK`·`MENU_UNAVAILABLE`·`INVALID_OPTION` → 409 변환), Route Handler `POST /api/orders`(201/200), `create_order` 통합 테스트(조작 가격 무시·옵션 추가 가격 합산·동시 주문 재고 음수 방지·롤백). Route Handler와 저장소는 팀장이 수정 중인 `AppError` 규격 확정 후 작성.
