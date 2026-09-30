# T-32 [송금했어요] 송금 신고 — 검증

> **현황(2026-09-30): BE1 API 부분 구현·검증 완료, PR 전.** Architecture 포트대로 T-11(PR #61, 유은조)의 `OrderRepository.findByToken`을 재사용하고 `setTransferReported(id)`를 추가했다. #61이 dev에 병합되면 최신 dev에서 브랜치를 만들어 PR을 올린다(GitWorkflow). 고객 화면 버튼(김희진, FE1)·대시보드 "송금 신고됨 HH:MM" 표시(T-15)와의 연결 확인은 선행 완료 후. Tasks 상태는 바꾸지 않는다.

## 구현 (Architecture "POST /api/orders/{token}/transfer-report", PRD F-43)

- `src/app/api/orders/[token]/transfer-report/route.ts` — 본문 없음. 200 `{ transferReportedAt }`.
- `src/services/orderService.ts`의 `reportTransfer(token, { orderRepository })` — Architecture 파일 구조표(`orderService.ts: createOrder, getOrderByToken, reportTransfer, requestCancel`)대로
  - 토큰 형식(64자 소문자 16진수)이 틀리면 DB를 부르지 않고 404(존재 여부 구분 안 함 — F-10)
  - `findByToken` → 없음 404 `NOT_FOUND` · 결제대기·계좌이체가 아님(현금 포함) 409 `INVALID_TRANSITION` · 이미 신고됨이면 기존 시각 200(멱등) · 아니면 `setTransferReported(id)`
  - 기록되지 않았으면(조회 뒤 다른 요청이 먼저 신고했거나 상태가 바뀜) 다시 조회해 먼저 기록된 시각 200 또는 409
  - 시각은 ISO 8601 UTC(`Z`)로 맞춘다(Architecture "API 규격 — 공통")
- `supabaseOrderRepository.setTransferReported(id)` — **조건부 갱신 한 번**(`status='pending' AND payment_method='transfer' AND transfer_reported_at IS NULL`)으로 최초 1회만 기록, 기록한 시각 또는 `null`. 주문 상태는 건드리지 않는다. `orders` 갱신이라 `updated_at` 트리거·Realtime UPDATE가 대시보드(T-15)로 전달된다.
- `ports.ts`: `OrderRepository.setTransferReported(id): Promise<string | null>` (Architecture "Repository 포트" 이름 그대로). 새 마이그레이션 없음(`transfer_reported_at` 컬럼은 0001에 있음).

## 요구사항 대응 (DoD)

| ID / 완료 기준 | 구현 | 검증 |
|---|---|---|
| F-43 신고 시각 기록 | `setTransferReported` 조건부 갱신 | 통합 "결제대기·계좌이체 → 기록" · 실제 호출 200 |
| 상태 결제대기 유지 | 상태 컬럼을 갱신하지 않음 | 통합(기록 후 status=pending) · 실제 호출 후 상태 조회 pending |
| 연타 시 시각 덮어쓰기 없음 | 서비스: 이미 신고됨이면 기록 안 함 · 저장소: `transfer_reported_at IS NULL` 조건 | 서비스 단위 · 통합(두 번째 → 첫 시각, **동시 2회 → 시각 하나·두 응답 같음**) · 실제 호출 두 번 같은 시각 |
| 현금 주문 거부 | 409 | 서비스 단위 · 통합(현금 → 기록 없음) · Route 409 · 실제 호출 409 |
| 결제대기 아님 거부 | 409 | 서비스 단위(6개 상태) · 통합(paid·cooking·cancelled·expired, 신고 뒤 결제확인된 주문 409) |
| 토큰 불일치 404 | 형식 검사 + 없음 | 서비스(형식 5종) · 통합(없는 토큰) · 실제 호출 404 |
| 대시보드 "송금 신고됨 HH:MM" | — | **T-15(유은조·김 혁) 화면 범위.** 이 API는 시각 기록까지 |
| 고객 [송금했어요] 버튼 | — | **김희진(FE1) 범위.** 버튼 노출 조건 `canTransferReport`는 T-11 응답(실제 호출: 신고 후 false) |

## 테스트 (Red-First: 서비스 테스트 17개가 `reportTransfer` 없음으로 실패 확인 후 구현)

- `tests/unit/services/transferReportService.test.ts` 17개(가짜 저장소) — T-51(#62)이 `orderService.test.ts`를 고치므로 충돌을 피해 파일 분리
- `tests/integration/supabaseOrderRepository.transferReport.test.ts` 11개(실제 로컬 DB — 저장소 7 + 서비스 4)
- `tests/unit/api/transferReportRoute.test.ts` 4개(경로 토큰 전달·200·409·404·500 비노출)

## 검증 (2026-09-30, Node 20.20.2, 로컬 Supabase — PR #61 위, 마이그레이션 0001·0003·0007~0013·0016·0017)

- `npm run test` 241 통과 · `npm run test:integration` 58 통과 · `typecheck` 0 · `lint` 0 · `build` 통과(`ƒ /api/orders/[token]/transfer-report`)
- 실제 호출(로컬 DB에 연결한 `next dev` — 운영 DB 미사용): 계좌이체 첫 신고 200 → 1초 뒤 다시 200(같은 시각) · 현금 409 · 없는 토큰 404 · 형식 틀린 토큰 404 · `GET /api/orders/{token}`(T-11) status pending, canTransferReport false

## 이력

- 09-26: T-11 전이라 임시로 `reportTransfer(token, at)` 저장소 함수 하나로 구현(브랜치 `feat/T-32-transfer-report`)
- 09-30: T-11(#61)의 `findByToken` 위에서 Architecture 포트(`findByToken` + `setTransferReported(id)`)로 다시 구현

## 남은 일

- [ ] #61(T-11) dev 병합 → 최신 dev에서 `feat/T-32-transfer-report` 새로 만들어 옮기기 → 테스트 재통과 → PR(base dev)
- [ ] 선행 T-11·T-15 병합 후: 김희진 버튼 → 이 API → 대시보드 표시 연결 확인
- [ ] 노션 T-32 카드 진행 공유
