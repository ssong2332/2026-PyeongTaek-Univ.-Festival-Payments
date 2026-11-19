# T-54 입금 확인 시 자동 조리 시작 · 취소 요청 대기 중 조리중 진입 차단 — 검증 (BE1)

> **현황(2026-11-12, 초안): BE1 서버 부분 구현 완료, 0106 DB 함수(DB1) 병합 대기.** 0106이 `dev`에 들어오면 최신 `dev`를 반영하고 아래 "검증" 절을 다시 채운다.
> 근거: DECISIONS #64·#71·#72, #155(2026-11-09 결정·2026-11-11 팀장 정리), #161 리뷰(2026-11-11).
> 범위: 서버(상태 규칙·서비스·저장소)와 테스트. 대시보드 버튼 숨김(목록 API·Realtime `availableActions` 입력)은 #160 후속 UI PR(유은조), 0106 SQL·권한 검증은 DB1(서동혁).

## 만든 것

| 커밋 | 내용 |
|---|---|
| 529edaa | `confirm_payment`: pending → **cooking**(DECISIONS #64). `paid`·`start_cooking`은 기존 결제확인 주문용으로 유지. 새 흐름에 맞춰 테스트 수정 — 단위 2곳, 통합 `t16-admin-transition`(#155 결정 3)·`t18-sweep-expire`, E2E `t24-transfer-order` |
| d13ed28 | 취소 요청 대기 중(`cancel_requested_at` 있음 + `cancel_rejected_at` 없음)이면 `confirm_payment`·`confirm_cash`·`start_cooking` → 409 `INVALID_TRANSITION`(DECISIONS #71). `findById`가 두 시각을 함께 읽음. T-35 `resolveCancelRequest`의 같은 판단을 `hasPendingCancelRequest`로 교체(동작 동일) |
| 5e47550 | T-35 통합 테스트에 차단 3개 + 거절 뒤 허용 3개 + 대기 중 승인 정상 1개 |
| 830d581 | **조회 뒤 끼어든 요청 방어(#161 리뷰)** — 서비스가 보호 대상 3개 동작이면 조회 시점의 두 시각을 `expectedCancel`로 항상 넘긴다(값이 `null`이어도). 저장소는 이 항목이 **있는지**로 0106 보호 함수를 고르고, 없으면 기존 `transition_order` |
| 179f518 | 경합 통합 테스트 `t54-cancel-guard-race`(아래) |

### 문서가 바뀌어도 따라가기 쉬운 구조

| 바뀔 수 있는 것 | 고칠 곳 |
|---|---|
| 막을 동작 목록 | `src/domain/order/stateMachine.ts`의 `BLOCKED_WHILE_CANCEL_PENDING` 한 곳(`guardsCancelRequest`가 이 목록을 씀) |
| "취소 요청 대기"의 뜻(T-55 새 입금 대기 주기 등) | `hasPendingCancelRequest` 한 곳. DB 보호 함수는 뜻을 판단하지 않고 "읽은 값이 그대로인가"만 보므로 바뀌지 않는다 |
| 0106 함수·인자 이름 | `src/infra/repositories/supabaseOrderRepository.ts`의 `GUARDED_TRANSITION` 상수 한 곳(테스트도 이 상수를 씀) |

## 0106 보호 함수 계약 (#164 병합 — `0106_atomic_transition.sql`, `docs/T-54-atomic-transition-db.md`)

- 함수: `transition_order_if_cancel_unchanged` — 입력은 기존 `transition_order` 8개 + `p_expected_cancel_requested_at`·`p_expected_cancel_rejected_at`, 반환 `orders` 1행
- `SELECT ... FOR UPDATE` → 없으면 `ORDER_NOT_FOUND`(404) → 두 값을 NULL 포함 비교(`IS DISTINCT FROM`) → 다르면 `STATE_CHANGED`(409), 같으면 같은 트랜잭션에서 `transition_order` 호출
- `0009`는 수정하지 않음. `SECURITY INVOKER`, `search_path=pg_catalog`, `PUBLIC/anon/authenticated` EXECUTE 제거, `service_role`만
- 저장소는 이 이름을 `GUARDED_TRANSITION` 상수 한 곳에서만 쓴다. 오류 변환(`STATE_CHANGED`·`ORDER_NOT_FOUND`)은 기존 표 그대로

## 테스트

### 단위 (Red-First: 구현 전 17개 실패 확인 — 함수·항목 없음)

- `stateMachine.test.ts`: `guardsCancelRequest` — 3개 동작만 참
- `adminOrderService.test.ts`: 3개 동작은 취소 요청이 없어도 `expectedCancel: { null, null }`을 넘김 / 조회 결과에 칸이 없어도 null / 거절된 요청은 두 시각을 그대로 / 완료·취소·환불은 넘기지 않음 / 읽은 뒤 요청이 저장되면 409 `STATE_CHANGED`·상태 그대로
- `supabaseOrderRepository.transition.test.ts`: 기대값 null이어도 보호 함수 호출·null 그대로 전달 / 시각 문자열을 바꾸지 않음 / 항목이 없으면 기존 함수를 기존 인자 8개로

### 통합 `tests/integration/t54-cancel-guard-race.test.ts` (실제 DB, mock 없음)

| 시나리오 | 확인 |
|---|---|
| 고객 먼저 × 3개 동작 | 관리자가 읽은 뒤 고객 요청 저장 → 409 `STATE_CHANGED`, 상태·재고·이력 그대로, 요청은 남음 |
| 막힌 뒤 승인 | 취소·재고 복구 — 처리 불가로 남지 않음 |
| 막힌 뒤 거절 | 다시 입금 확인 → 조리중, 이력 `cancel_request_reject` → `confirm_payment` |
| 관리자 먼저 | 별도 DB 세션이 보호 함수로 잠근 채 2초 대기하는 동안 고객 요청 → 잠금 해제까지 기다린 뒤 409 `CANCEL_REQUEST_NOT_ALLOWED`, 주문은 조리중·요청 없음, 이력 1행 |
| 진짜 동시 8건 | 주문마다 한쪽만 성공, "조리중 + 요청 걸림" 0건, 재고 불변 |

- 별도 세션 잠금은 `t07-create-order`와 같은 방식(`docker exec … psql`, `pg_sleep`)
- 0106 병합 전에는 함수가 없어 7개 모두 실패(Red 확인, 2026-11-12)

## 검증 (2026-11-12 사전 확인 — 0106 병합 뒤 다시 채움)

- Node 22.23.3, 로컬 Supabase, `feat/T-54-auto-cooking`(dev 7d0bf3f 기준)
- 단위 1374 · tsc 0 · build 통과 · lint 경고 2(기존, 이 PR 파일 아님)
- 계약대로 만든 **임시** 보호 함수를 로컬 DB에만 넣고(커밋 안 함, 끝나고 `supabase db reset --local`로 제거) 확인: 새 통합 7개 5회 반복 통과, 전체 통합 249 통과
- 망가뜨리기: 임시 함수에서 두 값 비교를 빼면 새 통합 7개 중 6개 실패(고객 먼저 5·동시 1). "관리자 먼저"는 기존 함수의 행 잠금만으로도 통과 — 이 테스트는 고객 요청이 걸린 채로 남지 않는지를 본다

## 남은 것

- [ ] 0106(DB1) `dev` 병합 → 최신 `dev` 반영 → 함수·인자 이름이 다르면 `GUARDED_TRANSITION`만 맞춤 → 단위·통합·E2E 재검증, 이 문서 "검증" 절 갱신
- [ ] `적용 예정(T-54)` 표시 제거(PRD·Architecture·DECISIONS·Tasks — #156으로 생긴 곳 전부)
- [ ] 운영: DB1이 운영 DB에 0106 적용·권한 확인 → 앱 배포 → 결제·취소 경합 스모크(#155 5절)
