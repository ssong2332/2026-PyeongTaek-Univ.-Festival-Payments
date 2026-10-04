# T-18 미입금 자동 만료 — 연결 검증 (BE1)

> **현황(2026-10-04): BE1 연결 검증 완료.** T-18의 DB 스윕 함수(0011·0012, PR #47·#44)와 스윕 호출 API·서비스·저장소(PR #52)는 김 혁(DB2)이 작성해 dev에 병합돼 있다. BE1은 새 코드를 만들지 않고, 그 호출 경로를 실제 DB에 연결해 선행 작업(T-14·T-16·T-17·T-32·T-35)과 함께 도는지 확인했다(팀장 확인 2026-10-04). **이 PR은 통합 테스트와 이 기록만 추가한다 — 소스 변경 없음.** Tasks 상태는 바꾸지 않는다.

## 검증 대상 (Architecture `POST /api/admin/sweep` · ADR-0006, PRD F-17·F-43)

- 호출 경로: `sweepOrders(repository)`(`src/services/sweepService.ts`) → `SupabaseSweepRepository.sweep()` → DB 함수 `sweep_order_timeouts()` → 건별 `transition_order(pending → expired, 'expire', 'system')`
- Route Handler(`src/app/api/admin/sweep/route.ts`)는 `requireAdmin()` 뒤 위 조합을 그대로 부른다. 통합 테스트는 mock을 쓰지 않으므로(DECISIONS #46) 서비스부터 실제 저장소·실제 DB로 직접 호출했다.

## 다른 테스트와의 분담

| 무엇 | 어디서 |
|---|---|
| 관리자 인증(401)·응답 형식·DB 오류 500 | `tests/unit/api/adminSweepRoute.test.ts` (김 혁) |
| 9분59초/10분 경계, 설정값 변경·잘못된 설정, CAS 충돌 건너뛰기, 실행 권한 — 기준 시각 `p_now`가 필요한 검증 | `tests/integration/sweep_expire.sql`·`sweep_expire_transition.sql` (김 혁, CI `sweep-contract`) |
| **호출 경로(서비스 → 저장소 → 실제 DB)와 T-32·T-16·T-17·T-35 서비스 연결, 동시 호출** | **`tests/integration/t18-sweep-expire.test.ts` (이 PR, 15개)** |

API는 기준 시각을 받지 않고 DB의 `now()`를 쓴다. 그래서 이 테스트는 주문의 `created_at`을 과거로 넣어 경과 시간을 만든다. 만료 기준(분)은 DB 함수와 같은 규칙으로 읽는다(`payment.expire_minutes`, 없으면 10).

## 요구사항 대응

| 완료 기준 (Tasks T-18 · F-17 · F-43) | 검증 |
|---|---|
| 결제대기가 만료 시간을 넘기면 만료 + 재고 복구 + 시스템 주체 이력 | 기준 +1분 주문 → `expired`, 재고 8 → 10, 이력 `expire`·`system`·주체 없음, `closed_at` 기록 |
| 현금·송금 공통 | 계좌이체·현금 각각 |
| 만료 시간 전에는 만료 안 됨 | 기준 −1분 주문 → 그대로(정확한 경계는 SQL 테스트) |
| 송금 신고된 주문은 만료 제외 | **T-32 `reportTransfer` 서비스로 신고**한 주문 → 기준 +60분이어도 결제대기 유지, 재고·이력 그대로 |
| 만료 직전 입금 확인 시 만료 안 됨 | **T-16 `transition(confirm_payment)`** 뒤 스윕 → `paid` 유지 |
| 결제대기가 아닌 주문은 대상 아님 | paid·cooking·completed·cancelled |
| 재고 복구는 `transition_order` 한 곳 | 다시 스윕·동시 스윕 3회 → 이력 1행, 재고 10(두 번 복구되지 않음) |
| 멱등(Architecture API 표) | 두 번째 스윕 `{ expired: 0, completed: 0 }` |
| 대시보드 여러 대의 동시 호출 | 동시 3회 → 만료 건수 합 1 |
| 스윕과 송금 신고 경쟁 | 주문 8건에 스윕과 신고(조건부 갱신)를 동시에 → 주문마다 "만료 + 미신고 + 재고 복구" 또는 "결제대기 + 신고됨 + 재고 그대로" 둘 중 하나. **"만료됐는데 신고됨"은 0건**. 스윕 반환 건수 = 실제 만료 건수 |
| 만료 뒤 고객·관리자 동작 | 송금 신고 409 `INVALID_TRANSITION` · 취소 요청(T-35) 409 `CANCEL_REQUEST_NOT_ALLOWED` · 입금 확인·취소(T-17) 409 `INVALID_TRANSITION` · 상태 조회(T-11) `expired`, `canTransferReport`·`canCancelRequest` false |

## 검증 (2026-10-04, Node 22.23.3, 로컬 Supabase — dev e3026ca, 마이그레이션 0001·0003·0007~0013·0016~0018·0100~0102)

- `npm run test` 892 통과 · `npm run test:integration` 176 통과(T-18 15개 포함) · `typecheck` 0 · `lint` 0 · `build` 통과
- 운영 DB는 사용하지 않았다(로컬 DB만).
- 테스트가 실제로 잡는지 일부러 망가뜨려 확인(확인 후 원복):
  - 저장소가 기준 시각을 과거로 넘기게 바꿈 → 7개 실패
  - 로컬 DB의 스윕 함수에서 `transfer_reported_at IS NULL` 조건을 뺌 → "송금 신고된 주문은 결제대기 유지" 실패
- 경쟁 테스트는 6회 반복 실행에서 만료 0~5건/8건으로 두 경우가 모두 나왔고 매번 통과했다.

## 확인한 점·남은 것

- 소스에서 고칠 점은 발견하지 못했다.
- 통합 테스트는 파일을 하나씩 순서대로 돌리고(`fileParallelism: false`) 테스트마다 만든 주문을 지운다. 스윕은 DB 전체를 대상으로 하므로, 다른 테스트가 오래된 결제대기 주문을 남겨 두면 건수 검증(`expired: 1`)이 어긋날 수 있다.
- 자동 완료(T-19, `auto_complete.enabled`)는 이 검증 범위가 아니다 — 설정이 꺼진 상태(`completed: 0`)만 확인했다.
- pg_cron 스케줄(0019, PR #82)과 대시보드의 30초 주기 호출은 각 작업에서 확인한다. 로그인을 포함한 흐름은 T-24 E2E.
