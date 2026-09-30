# T-10 네트워크 재시도 — 검증 (BE1 부분)

> **현황(2026-09-30): BE1 부분 구현·검증 완료, 선행 T-09(주문 화면, 김희진) 전.** Tasks T-10 담당은 "BE1(API) / FE1(UI)". BE1 부분 = 서버 멱등 처리(T-08에서 완료) + 주문 요청 재시도 함수 `postOrderWithRetry()`. 결제 화면(`useCheckout`)에서 이 함수를 쓰고 재시도 버튼·장바구니 유지를 붙이는 것은 FE1 범위. Tasks 상태는 바꾸지 않는다(선행 T-09 미완료 — 선작업 안전 규칙).

## 구현 (Architecture "고객 주문 생성"·파일 구조 `lib/api/client.ts`, DECISIONS #24, PRD F-13)

- `src/lib/api/client.ts`
  - `fetchJson(url, init, { timeoutMs?, parse? })` — 8초 타임아웃(AbortController). 실패는 `AppError(code, status, details)`로 던진다: 에러 봉투가 있으면 서버의 `code`·`details` 그대로, 응답이 없으면(네트워크 오류·타임아웃) `INTERNAL_ERROR` + 상태 0. `features/*` 훅이 이를 `{ status: 'error', code }`로 상태화한다(Architecture 오류 처리 절).
  - `postOrderWithRetry(body)` — `POST /api/orders`. 네트워크 오류·타임아웃·5xx만 자동 2회(1초·2초 뒤), 4xx는 재시도 없음. 재시도마다 같은 본문(같은 멱등키)이라 주문은 1건만 생긴다(F-08, 서버 T-08). 성공 응답은 `CreateOrderResponseSchema`로 검사.
- **문서에 없어서 정한 것**: 응답을 끝내 못 받았을 때의 에러 코드. 새 `ErrorCode`를 만들지 않고(공용 계약 변경 회피) 기존 `INTERNAL_ERROR`에 상태 0(응답 없음)을 쓴다. 화면 처리는 5xx와 같이 "수동 재시도 버튼 + 장바구니 유지"라 구분이 필요 없다(Architecture `/checkout` 행).
- 서버 코드 변경 없음.

## 요구사항 대응 (DoD)

| ID / 완료 기준 | 구현 | 검증 (`tests/unit/lib/api/client.test.ts`) |
|---|---|---|
| F-13 첫 요청 타임아웃 → 자동 재시도 성공 → 주문 1건 | 같은 본문(멱등키)으로 재전송 · 서버 멱등(T-08) | "8초 타임아웃 → 같은 멱등키로 재전송, 재시도 성공 시 created=false 응답" · 서버 쪽은 T-08 통합 테스트 "같은 멱등키 2회 → 주문 1건·재고 1회 차감"(`tests/integration/createOrder.test.ts`) |
| DECISIONS #24 타임아웃 8초 | AbortController 8초 | 7.999초까지 재시도 없음 |
| 자동 2회, 1초·2초 뒤 | `RETRY_DELAYS_MS` | 네트워크 오류 2번 → 1초·2초 경계에서 재전송 확인, 총 3번 |
| 5xx 재시도 | 상태 ≥ 500 | 500 → 재시도 성공 · 3번 모두 503 → 503으로 끝남 |
| 4xx 재시도 없음 | 상태 < 500 | 409 `OUT_OF_STOCK`(details 유지)·429 `RATE_LIMITED`(retryAfterSeconds 유지)·400 → 1번만 |
| F-13 N회 전부 실패 → 에러 안내 + 수동 재시도 | 마지막 실패를 던짐 | 3번 모두 네트워크 오류 → `INTERNAL_ERROR`·상태 0. 버튼·장바구니 유지는 FE1(T-09·T-10 화면) |

## 테스트 (Red-First: 모듈 없음으로 실패 확인 후 구현)

- `tests/unit/lib/api/client.test.ts` 12개 — 가짜 fetch + `vi.useFakeTimers()`(Architecture 테스트 절 "시간은 fake timers").
- 테스트가 규칙 위반을 잡는지 확인: 4xx도 재시도하게 바꾸면 4개 실패, 타임아웃을 5초로 바꾸면 1개 실패 → 원복.

## 검증 (2026-09-30, Node 20.20.2, dev c062e00 기준)

- `npm run test` 216 통과 · `typecheck` 0 · `lint` 0 · `build` 통과. 서버 코드 변경이 없어 통합 테스트는 이번 변경과 무관(서버 멱등은 T-08 통합 테스트로 검증됨).

## 남은 일

- [ ] 김희진(FE1)에게 함수 위치·사용법 공유 → `useCheckout`에서 사용, 재시도 버튼·장바구니 유지
- [ ] T-09 연결 후 실제 화면에서 네트워크 끊김 → 재시도 동작 확인(FE1과 함께)
