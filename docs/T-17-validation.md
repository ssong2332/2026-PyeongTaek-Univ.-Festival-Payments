# T-17 취소·환불 처리(관리자) — 검증

> **현황(2026-10-01): 리뷰 반영(PR #72).** 2026-09-29 팀장 결정(PR #60 댓글)으로 T-16·T-17 공통 상태 전환 API는 PR #60(유은조)을 기준 구현으로 쓴다(09-30 dev 병합 — 관리자 action 6종 제한·`parseUuidParam` 포함). T-17(BE1)은 취소·환불을 실제 DB로 검증한다(QA 제안: 사유·환불 경로·재고 복구·상태 이력·중복 처리). 10-01 리뷰(DECISIONS #46)에 따라 통합 테스트는 mock 없이 서비스 `transition()`을 실제 저장소로 직접 호출하도록 바꿨다. 취소·환불 화면은 김 혁 PR #58(FE2). 상태 전환(검증중·완료)은 팀장 판단.

## 범위

- API 구현: `POST /api/admin/orders/{id}/transition`의 `cancel`·`refund` — **PR #60(유은조)**. 이 작업에서 API·서비스 코드는 바꾸지 않는다.
- 규칙: 허용 전환·사유 필수·환불 경로 확인·재고 복구·CAS는 T-14(dev 병합)의 `stateMachine`·`adminOrderService.transition`·DB 함수 `transition_order`(0009). 단위·DB 함수 테스트는 T-14에 있다.
- T-17 추가분: 서비스 `transition()`부터 실제 DB까지 취소·환불이 이어지는지, 거부 시 아무것도 바뀌지 않는지, 환불이 매출 집계(T-21 `get_stats`, 0016)에서 빠지는지.

## 테스트 구조 (DECISIONS #46)

| 층 | 무엇으로 | 어디서 |
|---|---|---|
| 서비스 → 저장소 → 실제 DB (재고·이력·환불 경로·매출·동시 처리) | `transition()` + `createSupabaseOrderRepository(createServiceClient())`, **mock 없음** | `tests/integration/t17-admin-cancel-refund.test.ts` 16개 |
| Route Handler 경계 (관리자 인증 401, 요청 검사 400, 에러 봉투) | 단위 테스트(서비스·인증은 가짜) | `tests/unit/api/adminOrderTransitionRoute.test.ts`(#60) — T-17에서 "사유 빈 문자열 → 400 `VALIDATION_ERROR`" 2건 추가 |
| 로그인을 포함한 전체 흐름 | 실제 로그인 | T-24 E2E |

## 요구사항 대응 (DoD — PRD ID ↔ 검증)

| ID / 완료 기준 | 검증 |
|---|---|
| F-18 결제대기·결제확인 취소 → 상태 취소 | 통합: 결제대기(현금)·결제확인(계좌이체) 취소 → 결과·DB `status: cancelled`, `closed_at` 기록 |
| F-18 재고 복구(차감 전 수량과 일치) | 통합: 항목 2개(수량 2·3) 주문 취소 → 두 메뉴 재고가 차감 전(10)으로 |
| F-18 사유·시각·주체 기록 | 통합: 이력 1행 — `cancel`, `admin`, 관리자 id, 사유(앞뒤 공백 제거). 시각은 `created_at`(NOT NULL DEFAULT now()) |
| F-19 조리중 환불 → 경로 기록·재고 복구 | 통합: 계좌이체 → `bank`, 현금 → `cash`. `orders.refund_channel`에 경로, 재고 복구, 이력에 사유. (Architecture 스키마상 환불 경로는 `orders.refund_channel`에 저장 — 이력 테이블에는 경로 컬럼이 없다) |
| F-19 매출 통계에서 환불 차감 | 통합: 조리중 6,000원 주문 — 환불 전 `get_stats` sales 6,000 → 환불 후 sales 0, refundedAmount 6,000, refundedCount 1, byMenu 비어 있음 |
| F-19 완료 주문 환불 불가 / Tasks 완료 주문 거부 | 통합: 완료 주문 cancel·refund → 409 `INVALID_TRANSITION`, 변화 없음 |
| Tasks 사유 빈값 거부 | 통합: 사유 없음·공백·빈 문자열 → 400 `REASON_REQUIRED`(서비스), 환불 사유 공백 → 400. 모두 주문·재고·이력 변화 없음 · 단위: API에서는 빈 문자열을 요청 규격(`reason: string(1..200)`) 위반 400 `VALIDATION_ERROR`로 먼저 거르고 서비스를 부르지 않음 |
| 환불 경로 확인 | 통합: 경로 없음 → 400 `REFUND_CHANNEL_REQUIRED` · 결제수단과 다른 경로(현금↔bank, 계좌이체↔cash) → 409 `INVALID_TRANSITION`, 변화 없음 |
| 중복 처리(QA) | 통합: 같은 주문 동시 취소 2회 → 성공 1·409 1, 재고 1회 복구, 이력 1행 · 환불된 주문 재환불 → 409, 재고 1회 복구 |
| 완료 주문 버튼 비활성 | 화면은 #58(김 혁). `availableActions`(완료 주문 = 취소·환불 없음)는 T-14 단위 테스트 |

## 테스트

- `tests/integration/t17-admin-cancel-refund.test.ts` 16개 — 실제 로컬 DB, mock 없음. 메뉴·주문·항목은 테스트가 만들고 끝나면 지운다. 매출 집계는 다른 주문과 섞이지 않게 먼 미래 날짜(KST)로 둔다.
- `tests/unit/api/adminOrderTransitionRoute.test.ts` — "cancel·refund의 사유가 빈 문자열이면 400 `VALIDATION_ERROR`, 서비스 호출 없음" 2건 추가(기존 15 → 17).
- Red-First(테스트만 추가하는 작업이라 구현을 일부러 망가뜨려 확인):
  - 서비스가 사유·환불 경로를 저장소에 넘기지 않게 바꾸면(`reason: null`, `refundChannel: null`) 통합 16개 중 4개 실패(취소·환불 성공 4건의 이력 사유·환불 경로) → 원복 후 통과
  - 요청 규격에서 `reason`의 `min(1)`을 빼면 단위 추가분 2건 실패 → 원복 후 통과

## 이력

- 09-30: Route Handler를 통합 테스트에서 직접 부르고 `requireAdmin`만 vi.mock으로 통과시키는 방식으로 제출(#72)
- 10-01: 리뷰 반영 — 통합 테스트의 mock 제거, 서비스 직접 호출로 변경. Route Handler 경계는 단위 테스트로(DECISIONS #46)

## 검증 (2026-10-01, Node 20.20.2, 로컬 Supabase — 브랜치 기준 dev 2658e2a, 마이그레이션 0001·0003·0007~0013·0016)

- `npm run test` 263 통과 · `npm run test:integration` 64 통과(T-17 16개 포함) · `typecheck` 0 · `lint` 0 · `build` 통과

## 남은 일

- [x] #60 dev 병합(09-30) → 최신 dev에서 `feat/T-17-cancel-refund`로 옮기기 → PR #72
- [x] 10-01 리뷰 반영(mock 제거·단위 테스트 추가·문서 갱신)
- [ ] #58(취소·환불 화면) 연결 후 실제 관리자 화면에서 취소·환불 확인(김 혁·QA)
- [ ] 로그인을 포함한 상태 전환 흐름은 T-24 E2E에서 확인
