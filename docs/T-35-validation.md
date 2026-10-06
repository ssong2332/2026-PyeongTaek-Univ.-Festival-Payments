# T-35 고객 취소 요청 — 검증 (BE1 API 부분)

> **현황(2026-10-02): BE1 API 부분 구현·검증 완료.** 범위는 API 2개까지다 — 고객 화면 [취소 요청] 버튼·요청됨/거절됨 문구(FE1), 대시보드 "취소 요청됨 HH:MM" 강조와 [승인]/[거절] 버튼(김희진 — FE2 예외)은 각 화면 작업에서 연결한다. Tasks 상태는 바꾸지 않는다.
> 선행: T-11(완료) · T-15(완료) · T-17(PR #72 — 검토 중, 이 작업은 dev에 있는 공통 `transition()`만 쓴다).
> 팀장 확인(2026-10-02)에 따라 진행: ① 거절 사유 필수 ② 거절 기록은 새 DB 함수 없이 코드에서(조건부 UPDATE → 이력 INSERT, 실패 시 되돌리기) ③ 이미 거절된 요청의 재승인·재거절은 409 ④ 사전 확인은 `getAdminOrderById` 재사용, 최종 판단은 조건부 UPDATE.

## 구현 (Architecture "고객 API"·"관리자 API" 표, 상태 머신 `cancel_request`·`cancel_request_reject`, PRD F-45·F-18)

### 고객: `POST /api/orders/{token}/cancel-request` — 본문 없음, 200 `{ cancelRequestedAt }`

- `src/app/api/orders/[token]/cancel-request/route.ts`
- `orderService.requestCancel(token, { orderRepository })` (Architecture 파일 구조표의 이름 그대로)
  - 토큰 형식(64자 소문자 16진수)이 틀리면 DB를 부르지 않고 404, 없는 토큰도 같은 404(F-10)
  - 결제대기·결제확인이 아니거나 이미 거절됨 → 409 `CANCEL_REQUEST_NOT_ALLOWED`
  - 이미 요청됨 → 기존 시각 200(멱등, 연타 시 덮어쓰기 없음)
  - `setCancelRequested(id)`가 기록하지 못하면(조회 뒤 다른 요청이 먼저 기록했거나 상태가 바뀜) 다시 조회해 먼저 기록된 시각 200 또는 409
  - 응답 시각은 `toUtcIsoString`으로 ISO 8601 UTC — `GET /api/orders/{token}`의 `cancelRequestedAt`과 같은 값
- `supabaseOrderRepository.setCancelRequested(id)` — 조건부 갱신 한 번(`status IN ('pending','paid') AND cancel_requested_at IS NULL AND cancel_rejected_at IS NULL`). 주문 상태·재고·이력은 건드리지 않는다(상태 표 "이력 없음"). `orders` 갱신이라 Realtime UPDATE가 대시보드로 전달된다.

### 관리자: `POST /api/admin/orders/{id}/cancel-request` — `{ decision: 'approve'|'reject', reason: string(1..200) }`, 200 `AdminOrderDto`

- `src/app/api/admin/orders/[id]/cancel-request/route.ts` — `requireAdmin()` → `parseUuidParam` → `AdminCancelRequestDecisionSchema`(`src/lib/dto/adminOrder.ts`에 추가) → 서비스. `transition` 라우트와 같은 순서·같은 오류 형식.
- `adminOrderService.resolveCancelRequest({ orderId, decision, reason, adminId }, { adminOrderRepository, orderRepository })`
  1. `getAdminOrderById` — 없으면 404 `NOT_FOUND`
  2. 사전 확인: 결제대기·결제확인이 아님 / 취소 요청 없음 / 이미 거절됨 → 409 `INVALID_TRANSITION`
  3. 사유가 공백뿐 → 400 `REASON_REQUIRED` (빈 문자열·200자 초과는 라우트에서 400 `VALIDATION_ERROR`)
  4. 승인 = `transition({ action: 'cancel', reason })` — T-17 취소와 같은 경로(DB 함수 `transition_order`: 재고 복구 + 이력 `cancel`)
  5. 거절 = `orderRepository.rejectCancelRequest(id, adminId, reason)` — `false`면 409 `INVALID_TRANSITION`
  6. `getAdminOrderById`로 갱신된 `AdminOrderDto` 반환
- `supabaseOrderRepository.rejectCancelRequest(id, actorId, reason)` (DECISIONS #56)
  - ① 조건부 UPDATE(`status IN ('pending','paid') AND cancel_requested_at IS NOT NULL AND cancel_rejected_at IS NULL` → `cancel_rejected_at`) — 0행이면 `false`
  - ② `order_status_history` INSERT(`action='cancel_request_reject'`, `actor_type='admin'`, `actor_id`, `reason`, `from_status = to_status`)
  - ③ ②가 실패하면 `cancel_rejected_at`을 NULL로 되돌리고 `AppError("INTERNAL_ERROR", 500)`. 이력 실패 원인은 `logger.error("order.cancel_request_reject.history_failed", …, { orderId })`로 남기고, 되돌리기도 실패하면 `logger.error("order.cancel_request_reject.rollback_failed", …, { orderId })`
- 새 마이그레이션 없음(컬럼은 0001에 있음).

### 포트·공용 파일 변경 (팀장 확인 요청)

| 파일 | 변경 |
|---|---|
| `src/services/ports.ts` | `OrderRepository.setCancelRequested(id): Promise<string \| null>` · `rejectCancelRequest(id, actorId, reason): Promise<boolean>` 추가 |
| `src/lib/dto/adminOrder.ts` | `AdminCancelRequestDecisionSchema` 추가(기존 스키마 변경 없음) |
| `src/services/adminOrderService.ts` | `resolveCancelRequest` 추가. `getAdminOrderById`의 인자 타입을 `Pick<AdminOrderRepository, "findById">`로 좁힘(동작·기존 호출부 변화 없음) |
| `src/infra/repositories/supabaseOrderRepository.ts` | 위 두 메서드. infra에서 `logger`를 처음 사용(이력 추가 실패·되돌리기 실패 로그 2종) |
| `docs/Architecture.md` | 상태 표 `cancel_request_reject` "사유 선택" → "사유 필수", 관리자 API 표에 "이미 거절된 요청도 409"·사유 오류 코드 추가 |
| `docs/DECISIONS.md` | #56 한 줄(팀장 위임 — 번호는 병합 시점에 #54·#55 뒤로 조정 필요할 수 있음) |

기록 시각은 T-32 송금 신고와 같은 방식(앱 서버 시각 `new Date().toISOString()`).

## 요구사항 대응 (DoD)

| ID / 완료 기준 | 구현 | 검증 |
|---|---|---|
| F-45 취소 요청 시각 저장 | `setCancelRequested` 조건부 갱신 | 통합 "pending·paid → 기록" |
| 상태 유지(결제대기·결제확인) | 상태 컬럼을 갱신하지 않음 | 서비스 단위 · 통합(상태·재고·이력 그대로) |
| 연타 시 시각 덮어쓰기 없음 | 서비스 멱등 + 저장소 `IS NULL` 조건 | 서비스 단위 · 통합(두 번째 = 첫 시각, **동시 5회 → 시각 하나**) |
| 조리중 이후 요청 거부(저장 0건) | 409 `CANCEL_REQUEST_NOT_ALLOWED` | 서비스 단위·통합(cooking·completed·cancelled·refunded·expired) |
| 거절된 주문 재요청 불가 | 서비스 + 저장소 조건 | 서비스 단위 · 통합(거절 뒤 재요청 409) |
| 토큰 검증 | 형식 검사 + 없음 → 404 | 서비스 단위(형식 5종) · 통합 · 라우트 |
| F-18 승인 시 취소 + 재고 복구 + 사유 이력 | `transition(cancel)` | 통합(재고 8 → 10, 이력 `cancel`·사유·관리자 id, `closed_at`) |
| F-18 거절 시 상태 유지 + 요청 해제 + 이력 | `rejectCancelRequest` | 통합(상태·재고 그대로, `cancel_rejected_at`, 이력 `cancel_request_reject`) |
| 사유 필수(승인·거절) | zod `min(1)` + 서비스 trim | 라우트 단위(빈 문자열 400 `VALIDATION_ERROR`) · 서비스 단위·통합(공백 400 `REASON_REQUIRED`) |
| 요청 없음·이미 거절·조리 시작 → 409 | 사전 확인 + 조건부 UPDATE | 서비스 단위 · 통합(승인·거절 각각, 변화 없음) |
| 동시 거절 | 조건부 UPDATE가 최종 판단 | 통합(3건 동시 → 1건 성공, 나머지 409, 이력 1행) |
| 이력 실패 시 되돌리기 | 저장소 ③ | 저장소 단위(가짜 클라이언트 — 실제 DB로 만들 수 없는 경로) |
| 관리자 인증 | `requireAdmin` | 라우트 단위(401, 서비스 미호출) — 로그인 포함 흐름은 T-24 E2E |
| 고객 화면 버튼·문구 / 대시보드 강조·버튼 | — | **FE1·FE2 범위** |

## 테스트 (Red-First: 구현 전 단위 40개 실패 + 관리자 라우트 테스트 파일 불러오기 실패 확인 — 함수·라우트 없음)

| 파일 | 수 | 내용 |
|---|---|---|
| `tests/unit/services/cancelRequestService.test.ts` | 17 | `requestCancel` 규칙 |
| `tests/unit/services/resolveCancelRequestService.test.ts` | 14 | `resolveCancelRequest` 승인·거절·거부 |
| `tests/unit/infra/repositories/supabaseOrderRepository.cancelRequest.test.ts` | 5 | 거절 기록 호출 내용·되돌리기·로그 |
| `tests/unit/api/cancelRequestRoute.test.ts` | 4 | 고객 라우트 |
| `tests/unit/api/adminCancelRequestRoute.test.ts` | 18 | 관리자 라우트(인증·검증·전달·오류 봉투) |
| `tests/integration/t35-cancel-request.test.ts` | 29 | 실제 DB — mock 없음(DECISIONS #46), 서비스를 실제 저장소로 직접 호출 |

- 가짜 저장소는 `tests/unit/fakes/`(Architecture 테스트 규칙): `fakeTokenOrderRepository.ts`에 `setCancelRequested` 추가, `fakeCancelRequestRepositories.ts` 새로 작성(끼어드는 다른 관리자 요청을 흉내 낼 수 있음).
- 일부러 망가뜨려 확인: 서비스의 거절 여부 확인 제거 → 단위 1·통합 2 실패 / 저장소 거절 조건(요청 있음·미거절) 제거 → 단위 1·통합 2 실패 / 되돌리기 제거 → 단위 2 실패 / 승인·거절 사전 확인 제거 → 단위 2·통합 2 실패. 원복 후 전부 통과.

## 검증 (2026-10-02, Node 22.23.3, 로컬 Supabase — #80(T-32) 브랜치 a9dcf60(dev d51e54d 포함) 위)

- `npm run test` 754 통과 · `npm run test:integration` 124 통과(T-35 29개 포함) · `typecheck` 0 · `lint` 0 · `build` 통과(`ƒ /api/orders/[token]/cancel-request`, `ƒ /api/admin/orders/[id]/cancel-request`)
- 운영 DB는 사용하지 않았다(로컬 DB만).
- (2026-10-03, QA 리뷰 반영) `AdminCancelRequestDecisionSchema`를 `z.strictObject`로 변경 — 규격에 없는 필드는 400 `VALIDATION_ERROR`·서비스 미호출(라우트 단위 테스트 1건 추가, 구현 전 실패 확인). `npm run test` 755 통과 · `typecheck` 0 · `lint` 0 · `build` 통과. 통합 테스트는 서비스를 직접 호출해 이 변경의 영향이 없으며 CI에서 다시 확인한다.
- (2026-10-03, #80 병합 후) 최신 dev(730c4ef — T-32 #80·T-17 #72·#58·T-46 포함)를 브랜치에 병합. 충돌은 `docs/DECISIONS.md` 1건(#54·#56 두 줄 모두 유지). 병합 후 `npm run test` 859 통과 · `npm run test:integration` 143 통과(T-35 29개 포함) · `typecheck` 0 · `lint` 0 · `build` 통과.

## 한계·남은 것

- 거절 기록은 한 트랜잭션이 아니다(DECISIONS #56). 이력 INSERT 실패와 되돌리기 실패가 겹치면 거절 시각만 남는다 — 로그 이벤트로 찾아 수동 정정.
- 승인은 사전 확인 뒤 `transition(cancel)`을 부른다. 그 사이 다른 관리자가 거절해도 취소는 진행된다(관리자는 요청과 무관하게 취소할 수 있으므로 결과가 어긋나지 않는다). 상태가 바뀐 경우는 `transition_order`의 CAS가 409 `STATE_CHANGED`로 막는다.
- 화면 연결 후 실제 화면 확인(FE1·FE2), 로그인 포함 흐름은 T-24 E2E.
