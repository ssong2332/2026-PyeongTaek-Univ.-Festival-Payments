# T-17 취소·환불 처리(관리자) — 검증

> **현황(2026-09-30): 실제 DB 검증 테스트 작성·통과, PR 전.** 2026-09-29 팀장 결정(PR #60 댓글)으로 T-16·T-17 공통 상태 전환 API는 PR #60(유은조)을 기준 구현으로 쓴다. T-17(BE1)은 그 API의 취소·환불을 실제 DB로 검증한다(QA 제안: 사유·환불 경로·재고 복구·상태 이력·중복 처리). #60이 dev에 병합되면 최신 dev에서 브랜치를 만들어 PR을 올린다. 취소·환불 화면은 김 혁 PR #58(FE2). Tasks 상태는 바꾸지 않는다.

## 범위

- API 구현: `POST /api/admin/orders/{id}/transition`의 `cancel`·`refund` — **PR #60(유은조)**. 이 작업에서 API 코드는 바꾸지 않는다.
- 규칙: 허용 전환·사유 필수·환불 경로 확인·재고 복구·CAS는 T-14(dev 병합)의 `stateMachine`·`adminOrderService.transition`·DB 함수 `transition_order`(0009). 단위·DB 함수 테스트는 T-14에 있다.
- T-17 추가분: API 입구부터 실제 DB까지 취소·환불이 이어지는지, 거부 시 아무것도 바뀌지 않는지, 환불이 매출 집계(T-21 `get_stats`, 0016)에서 빠지는지.

## 요구사항 대응 (DoD — PRD ID ↔ 검증)

| ID / 완료 기준 | 검증 (`tests/integration/t17-admin-cancel-refund.test.ts`) |
|---|---|
| F-18 결제대기·결제확인 취소 → 상태 취소 | 결제대기(현금)·결제확인(계좌이체) 취소 200, 응답 `status: cancelled`, `availableActions: []` |
| F-18 재고 복구(차감 전 수량과 일치) | 항목 2개(수량 2·3) 주문 취소 → 두 메뉴 재고가 차감 전(10)으로 |
| F-18 사유·시각·주체 기록 | 이력 1행: `cancel`, `admin`, 관리자 id, 사유(앞뒤 공백 제거). 시각은 `created_at`(NOT NULL DEFAULT now()) · 주문 `closed_at` 기록 |
| F-19 조리중 환불 → 경로 기록·재고 복구 | 계좌이체 → `bank`, 현금 → `cash`. 응답·`orders.refund_channel`에 경로, 재고 복구, 이력에 사유. (Architecture 스키마상 환불 경로는 `orders.refund_channel`에 저장 — 이력 테이블에는 경로 컬럼이 없다) |
| F-19 매출 통계에서 환불 차감 | 조리중 6,000원 주문: 환불 전 `get_stats` sales 6,000 → 환불 후 sales 0, refundedAmount 6,000, refundedCount 1, byMenu 비어 있음 |
| F-19 완료 주문 환불 불가 / Tasks 완료 주문 거부 | 완료 주문 cancel·refund → 409 `INVALID_TRANSITION`, 변화 없음 |
| Tasks 사유 빈값 거부 | 사유 없음·공백 → 400 `REASON_REQUIRED`, 빈 문자열 → 400 `VALIDATION_ERROR`(요청 규격 `reason: string(1..200)`), 환불 사유 공백 → 400. 모두 주문·재고·이력 변화 없음 |
| 환불 경로 확인 | 경로 없음 → 400 `REFUND_CHANNEL_REQUIRED` · 결제수단과 다른 경로(현금↔bank, 계좌이체↔cash) → 409 `INVALID_TRANSITION`, 변화 없음 |
| 중복 처리(QA) | 같은 주문 동시 취소 2회 → 200·409, 재고 1회 복구, 이력 1행 · 환불된 주문 재환불 → 409, 재고 1회 복구 |
| 완료 주문 버튼 비활성 | 화면은 #58(김 혁). API 응답 `availableActions`(완료 주문 = 취소·환불 없음)는 T-14 단위 테스트 |

## 테스트

- `tests/integration/t17-admin-cancel-refund.test.ts` 16개 — 실제 로컬 DB, 관리자 인증(`requireAdmin`)만 가짜(김 혁 #54 통합 테스트와 같은 방식). 메뉴·주문·항목은 테스트가 만들고 끝나면 지운다. 매출 집계는 다른 주문과 섞이지 않게 먼 미래 날짜(KST)로 둔다.
- Red-First(테스트만 추가하는 작업이라 구현을 일부러 망가뜨려 확인): route가 사유·환불 경로를 서비스에 넘기지 않게 바꾸면 16개 중 10개 실패 → 원복 후 16개 통과.

## 검증 (2026-09-30, Node 20.20.2, 로컬 Supabase — PR #60 위, 마이그레이션 0001·0003·0007~0013·0016)

- `npm run test` 215 통과 · `npm run test:integration` 63 통과(T-17 16개 포함) · `typecheck` 0 · `lint` 0 · `build` 통과(`ƒ /api/admin/orders/[id]/transition`)

## 남은 일

- [ ] #60 보완(관리자 action 6종 제한·orderId uuid 검증) 후 dev 병합 → 최신 dev에서 `feat/T-17-cancel-refund` 만들어 옮기기 → 재검증 → PR(base dev)
- [ ] Tasks·노션 T-16·T-17 협업 범위 반영(팀장 예정) 확인
- [ ] #58(취소·환불 화면) 연결 후 실제 관리자 화면에서 취소·환불 확인(김 혁·QA)
