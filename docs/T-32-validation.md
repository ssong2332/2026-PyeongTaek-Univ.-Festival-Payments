# T-32 [송금했어요] 송금 신고 — 선작업 검증

> **현황(2026-09-26): BE1 API 부분 구현·검증 완료, PR 전(선작업).** 선행 T-11(상태 페이지, 유은조)·T-15(대시보드, 유은조·김 혁)가 아직 dev에 없다. 고객 화면 버튼(김희진, FE1)·대시보드 "송금 신고됨 HH:MM" 표시(T-15)와의 연결 확인은 선행 완료 후(09-30 예정). Tasks 상태는 바꾸지 않는다.
> 브랜치 `feat/T-32-transfer-report`는 T-07 브랜치(PR #46) 위에서 시작했다 — 같은 저장소 파일을 쓰므로. #46 병합 후 최신 dev를 합쳐 PR을 올린다.

## 구현 (Architecture "POST /api/orders/{token}/transfer-report", PRD F-43)

- `src/app/api/orders/[token]/transfer-report/route.ts` — 본문 없음. 200 `{ transferReportedAt }`.
- `src/services/transferReportService.ts`의 `reportTransfer(token, { orderRepository, clock })`
  - 토큰 형식(64자 소문자 16진수)이 틀리면 DB를 부르지 않고 404(존재 여부 구분 안 함 — F-10)
  - 결과: 신고됨/이미 신고됨 → 200(시각) · 신고 불가(현금 또는 결제대기 아님) → 409 `INVALID_TRANSITION` · 없음 → 404 `NOT_FOUND`
- `supabaseOrderRepository.reportTransfer(token, at)` — **조건부 갱신 한 번**(`status='pending' AND payment_method='transfer' AND transfer_reported_at IS NULL`)으로 최초 1회만 기록 → 연타·동시 요청에도 시각 하나. 갱신이 안 되면 다시 읽어 없음/불가/이미 신고됨을 가린다. 주문 상태는 건드리지 않는다. `orders` 갱신이라 `updated_at` 트리거·Realtime UPDATE가 대시보드(T-15)로 전달된다.
- `ports.ts`: `TransferReportResult`, `OrderRepository.reportTransfer`
- **T-11과 겹치지 않게**: Architecture 포트 목록의 `findByToken`(T-11 상태 페이지에서도 필요)을 만들지 않고 T-32 전용 `reportTransfer`로 처리 — 같은 이름 함수를 두 브랜치가 따로 만드는 충돌을 피함. 새 마이그레이션 없음(`transfer_reported_at` 컬럼은 0001에 있음).

## 요구사항 대응 (DoD)

| ID / 완료 기준 | 구현 | 검증 |
|---|---|---|
| F-43 신고 시각 기록 | `reportTransfer` 조건부 갱신 | 통합 "결제대기·계좌이체 → 기록" · 실제 호출 200 |
| 상태 결제대기 유지 | 상태 컬럼을 갱신하지 않음 | 통합(기록 후 status=pending) · 실제 호출 후 DB pending |
| 연타 시 시각 덮어쓰기 없음 | `transfer_reported_at IS NULL` 조건 | 통합(두 번째 → 첫 시각) · **동시 2회 → 시각 하나** · 실제 호출 두 번 같은 시각 |
| 현금 주문 거부 | `payment_method='transfer'` 조건 → 409 | 통합(현금 → not_allowed, 기록 없음) · 서비스·Route 409 · 실제 호출 409 |
| 결제대기 아님 거부 | `status='pending'` 조건 → 409 | 통합(paid·cooking·cancelled·expired, 신고 뒤 결제확인된 주문) |
| 토큰 불일치 404 | 형식 검사 + 없음 | 서비스(형식 5종) · 통합(없는 토큰) · 실제 호출 404 |
| 대시보드 "송금 신고됨 HH:MM" | — | **T-15(유은조·김 혁) 화면 범위.** 이 API는 시각 기록까지 |
| 고객 [송금했어요] 버튼 | — | **김희진(FE1) 범위** |

## 테스트 (Red-First: 서비스·저장소·Route 모두 모듈/함수 없음으로 실패 확인 후 구현)

- `tests/unit/services/transferReportService.test.ts` 9개(가짜 저장소 + 고정 시계)
- `tests/integration/supabaseOrderRepository.transferReport.test.ts` 10개(실제 로컬 DB)
- `tests/unit/api/transferReportRoute.test.ts` 4개(경로 토큰 전달·200·409·404·500 비노출)

## 검증 (2026-09-26, Node 20.20.2, 로컬 Supabase — 마이그레이션 0001·0003·0007·0008·0009·0010)

- `npm run test` 192 통과 · `npm run test:integration` 56 통과 · `typecheck` 0 · `lint` 0 · `build` 통과(`ƒ /api/orders/[token]/transfer-report`)
- 실제 호출(로컬 DB에 연결한 `next dev` — 운영 DB 미사용): 계좌이체 첫 신고 200 → 다시 200(같은 시각) · 현금 409 · 없는 토큰 404 · 형식 틀린 토큰 404 · DB는 현금 주문 기록 없음, 계좌이체 주문 pending 유지

## 남은 일

- [ ] PR #46(T-07·T-08) 병합 후 최신 dev 병합 → PR(base dev)
- [ ] 선행 T-11·T-15 병합 후: 김희진 버튼 → 이 API → 대시보드 표시 연결 확인(09-30 낮)
- [ ] 노션 T-32 카드 진행 공유
