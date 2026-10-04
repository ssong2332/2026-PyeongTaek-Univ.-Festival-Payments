# T-18 미입금 자동 만료 — 연결 검증 (BE1)

> **현황(2026-10-04): BE1 연결 검증 완료 — 단, 자동 만료를 실제로 실행하는 경로는 아직 dev에 없다(아래 "남은 것").** T-18의 DB 스윕 함수(0011·0012, PR #47·#44)와 스윕 호출 API·서비스·저장소(PR #52)는 김 혁(DB2)이 작성해 dev에 병합돼 있다. BE1은 새 코드를 만들지 않고, 그 호출 경로를 실제 DB에 연결해 선행 작업(T-14·T-16·T-17·T-32·T-35)과 함께 도는지 확인했다(팀장 확인 2026-10-04). **이 PR은 통합 테스트와 이 기록만 추가한다 — 소스 변경 없음.** Tasks 상태는 바꾸지 않는다.

## 검증 대상 (Architecture `POST /api/admin/sweep` · ADR-0006, PRD F-17·F-43)

- 호출 경로: `sweepOrders(repository)`(`src/services/sweepService.ts`) → `SupabaseSweepRepository.sweep()` → DB 함수 `sweep_order_timeouts()` → 건별 `transition_order(pending → expired, 'expire', 'system')`
- Route Handler(`src/app/api/admin/sweep/route.ts`)는 `requireAdmin()` 뒤 위 조합을 그대로 부른다. 통합 테스트는 mock을 쓰지 않으므로(DECISIONS #46) 서비스부터 실제 저장소·실제 DB로 직접 호출했다.

## 다른 검증과의 분담

| 무엇 | 어디서 |
|---|---|
| 관리자 인증(401)·응답 형식·DB 오류 500 | `tests/unit/api/adminSweepRoute.test.ts` (김 혁) |
| 9분59초/10분 경계, 잘못된 설정 거부, CAS 충돌 건너뛰기, 실행 권한 — 기준 시각 `p_now`가 필요한 검증 | `tests/integration/sweep_expire.sql`·`sweep_expire_transition.sql` (김 혁, CI `sweep-contract`) |
| 실제 관리자 로그인으로 `POST /api/admin/sweep` 호출(200·4건 만료·system 이력·재고 복구·2회째 0건), 비로그인 401 | QA 실환경 검증(2026-10-04, PR #52 댓글) |
| **호출 경로(서비스 → 저장소 → 실제 DB)와 T-32·T-16·T-17·T-35 서비스 연결, 동시 요청, 설정값 반영** | **`tests/integration/t18-sweep-expire.test.ts` (이 PR, 21개)** |

API는 기준 시각을 받지 않고 DB의 `now()`를 쓴다. 그래서 이 테스트는 주문의 `created_at`을 과거로 넣어 경과 시간을 만든다. 만료 기준(분)은 DB 함수와 같은 규칙으로 읽는다(`payment.expire_minutes`, 없으면 10).

## 요구사항 대응

| 완료 기준 (Tasks T-18 · F-17 · F-43, PR #52 QA 확인 항목) | 검증 |
|---|---|
| 결제대기가 만료 시간을 넘기면 만료 + 재고 복구 + 시스템 주체 이력 | 기준 +1분 주문 → `expired`, 재고 8 → 10, 이력 `expire`·`system`·주체 없음, `closed_at` 기록 |
| 현금·송금 공통 | 계좌이체·현금 각각 |
| 만료 시간 전에는 만료 안 됨 | 기준 −1분 주문 → 그대로(정확한 경계는 SQL 테스트) |
| 송금 신고된 주문은 만료 제외 | **T-32 `reportTransfer` 서비스로 신고**한 주문 → 기준 +60분이어도 결제대기 유지, 재고·이력 그대로 |
| 만료 직전 입금 확인 시 만료 안 됨 | **T-16 `transition(confirm_payment)`** 뒤 스윕 → `paid` 유지 |
| **입금 확인과 스윕 동시 요청에서 이중 전환·재고 오류 없음** | 주문 8건에 스윕과 관리자 전환(DB 함수 호출 한 번)을 동시에 — **입금 확인(계좌이체)·현금 수령 확인·취소** 각각. 주문마다 이력 정확히 1행, "만료(관리자 요청 409 `STATE_CHANGED`, 재고 10)" 또는 "관리자 전환 성공(스윕이 건너뜀)" 둘 중 하나. 스윕 반환 건수 = 실제 만료 건수. 취소와 겹쳐도 재고는 10(두 번 복구되지 않음) |
| 관리자가 취소한 주문(T-17) | `transition(cancel)` 뒤 스윕 → `cancelled` 유지, 재고 10 그대로, 이력 1행 |
| 결제대기가 아닌 주문은 대상 아님 | paid·cooking·completed·cancelled |
| 재고 복구는 `transition_order` 한 곳 | 다시 스윕·동시 스윕 3회 → 이력 1행, 재고 10 |
| 멱등(Architecture API 표) | 두 번째 스윕 `{ expired: 0, completed: 0 }` |
| 대시보드 여러 대의 동시 호출 | 동시 3회 → 만료 건수 합 1 |
| 스윕과 송금 신고 경쟁 | 주문 8건에 스윕과 신고(조건부 갱신)를 동시에 → "만료 + 미신고 + 재고 복구" 또는 "결제대기 + 신고됨 + 재고 그대로". **"만료됐는데 신고됨"은 0건** |
| 시간 값은 설정값 | `payment.expire_minutes`를 5로 → 6분 된 주문 만료·4분 된 주문 유지 / 30으로 → 29분 된 주문 유지, 원래 값으로 되돌린 뒤 스윕하면 만료(테스트가 끝나면 설정을 원래대로 되돌린다) |
| 만료 뒤 고객·관리자 동작 | 송금 신고 409 `INVALID_TRANSITION` · 취소 요청(T-35) 409 `CANCEL_REQUEST_NOT_ALLOWED` · 입금 확인·취소(T-17) 409 `INVALID_TRANSITION` · 상태 조회(T-11) `expired`, `canTransferReport`·`canCancelRequest` false |

## 검증 (2026-10-04, Node 22.23.3, 로컬 Supabase — dev e3026ca, 마이그레이션 0001·0003·0007~0013·0016~0018·0100~0102)

- `npm run test` 892 통과 · `npm run test:integration` 182 통과(T-18 21개 포함) · `typecheck` 0 · `lint` 0 · `build` 통과
- 운영 DB는 사용하지 않았다(로컬 DB만).
- Red-First: 기존 코드의 연결 검증이라 "구현 전 실패"가 성립하지 않는다. 대신 일부러 망가뜨려 테스트가 실패하는 것을 확인했다(모두 확인 후 원복, 로컬 DB 함수는 원본 마이그레이션으로 되돌리고 본문을 조회해 확인).
  - 저장소가 기준 시각을 과거로 넘기게 바꿈 → 7개 실패(1차 15개 기준)
  - 로컬 DB 스윕 함수에서 `transfer_reported_at IS NULL` 조건을 뺌 → "송금 신고된 주문은 결제대기 유지" 실패
  - 로컬 DB `transition_order`에서 상태 확인(CAS)을 뺌 → 동시 요청 테스트 3개 실패
  - 로컬 DB 스윕 함수가 설정을 무시하고 10분 고정 → 설정값 테스트 2개 실패
- 동시 요청 테스트는 반복 실행(스윕×송금 신고 6회, 스윕×관리자 전환 8회)에서 스윕이 이기는 경우와 지는 경우가 모두 나왔고 매번 통과했다.

## 남은 것

- **자동 만료를 실행하는 경로가 dev에 없다.** 스윕 API·DB 함수는 정상이지만 그것을 부르는 곳이 없어, 지금은 미입금 주문이 자동으로 만료되지 않는다(ADR-0006의 두 경로 모두 미연결).
  - pg_cron(0019): PR #82 Draft(김 혁)
  - 대시보드 30초 호출(`useSweepHeartbeat`): PR #51에서 "#52 병합 후 연결"로 분리된 뒤 아직 다시 연결되지 않음(PR #51 본문 미체크 항목, PR #52 QA 확인 항목 2번)
  - 누가 연결할지는 팀장 확인 대기. 이 PR 범위가 아니다.
- 통합 테스트는 파일을 하나씩 순서대로 돌리고(`fileParallelism: false`) 테스트마다 만든 주문을 지운다. 스윕은 DB 전체를 대상으로 하므로, 다른 테스트가 오래된 결제대기 주문을 남겨 두면 건수 검증(`expired: 1`)이 어긋날 수 있다.
- 자동 완료(T-19, `auto_complete.enabled`)는 이 검증 범위가 아니다 — 설정이 꺼진 상태(`completed: 0`)만 확인했다.
- 운영 DB의 pg_cron 실행 이력, 로그인을 포함한 화면 흐름(T-24 E2E)은 각 작업에서 확인한다.
