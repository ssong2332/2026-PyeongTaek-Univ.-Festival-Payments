# T-55 `0107` 새 입금 대기 주기·되돌리기 DB 계약 (DB1)

근거: #155의 2026-11-09 결정 7·8번, 2026-11-11 팀장 최종 결정(취소 재요청 허용), 2026-11-12 인계, DECISIONS #65.
SQL 초안은 #166(검토 초안)에서 작성됐고, 이 문서는 PR #166 팀장 리뷰 1번 요청에 따라 DB1이 확정한 계약이다.
이 문서는 0107 DB 선행 작업이며 관리자 API·화면 연결이나 T-55 전체 완료를 뜻하지 않는다.

## 스키마

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `orders.pending_since` | `timestamptz NULL` | 되돌리기로 시작한 새 입금 대기 주기의 시작 시각. 초기·레거시 주문은 NULL이며 만료 기준은 `created_at`을 그대로 쓴다. 되돌리기 성공 때만 비NULL로 기록한다 |
| `orders.transfer_reported_history` | `timestamptz[] NOT NULL DEFAULT '{}'` | 되돌리기 때 이전 주기의 `transfer_reported_at`을 순서대로 추가한다. 신고가 없던 주기는 추가하지 않는다 |

## RPC

`public.revert_transfer_order_to_pending(p_order_id uuid, p_actor_id uuid, p_reason text)` → `public.orders` 1행.

1. 사유를 공백 제거한다. NULL·빈값이면 `REASON_REQUIRED`, 200자 초과 또는 `p_actor_id` NULL이면 `VALIDATION_ERROR`.
2. 주문 행을 `FOR UPDATE`로 잠근다. 없으면 `ORDER_NOT_FOUND`, `payment_method='transfer' AND status='cooking'`이 아니면 `INVALID_TRANSITION`.
3. 잠금 뒤 `clock_timestamp()`를 새 주기 시작 시각으로 잡고, 한 트랜잭션에서 다음을 처리한다.
   - `status='pending'`, `pending_since=되돌린 시각`
   - 현재 `transfer_reported_at`을 `transfer_reported_history`에 추가한 뒤 NULL로 초기화
   - `cancel_requested_at`·`cancel_rejected_at` NULL (새 주기 취소 재요청 허용)
   - `paid_at`·`cooking_started_at`·`completed_at`·`closed_at`·`refund_channel` NULL
   - `order_status_history` 1행: `cooking → pending`, action `revert_to_pending`, `actor_type='admin'`, 관리자 ID·공백 제거한 사유, 시각=되돌린 시각
4. 재고는 바꾸지 않는다. 과거 `cancel_request_reject` 등 상태 이력은 삭제·수정하지 않는다.
5. 중간 실패 시 전체 롤백한다.

권한: `SECURITY INVOKER`, `search_path=pg_catalog`, `PUBLIC`·`anon`·`authenticated` EXECUTE 제거, `service_role`만 EXECUTE.

## 자동 만료 (`sweep_order_timeouts` 재정의)

결제대기 만료 기준만 `created_at`에서 `COALESCE(pending_since, created_at)`로 바꾼다. `transfer_reported_at IS NULL` 조건, `FOR UPDATE SKIP LOCKED`, CAS 충돌 건너뛰기, T-19 자동 완료, 설정 범위 검증, 권한은 `0012`와 같다.

되돌리기가 이전 주기 신고 표시를 같은 잠금 안에서 비우므로, 현재 `transfer_reported_at`이 비NULL이면 항상 이번 주기의 신고다. 앱 서버 시계가 DB보다 늦어 신고 시각이 `pending_since`보다 앞서 찍혀도 만료에서 제외된다.

## 신고 이력 저장 방식 결정 (DB1, 2026-11-19)

**주문 행의 `transfer_reported_history` 배열을 공식 이력 보관 방식으로 채택한다.** 별도 테이블·기존 상태 이력은 쓰지 않는다.

| 검토 항목 | 결정 |
|---|---|
| 복수 주기 누적 | 되돌릴 때마다 그 주기의 신고 시각 1개를 순서대로 추가한다. 신고 없는 주기는 추가하지 않는다. 되돌리기는 관리자 수동 조치라 원소 수는 되돌린 횟수 이하로 작다 |
| 담는 값 | 시각만 담는다. 주문 토큰·계좌·이름 등 식별 정보는 넣지 않는다 |
| 조회 권한 | `orders`와 같다(RLS·service_role 경유). 고객 API(`ORDER_BY_TOKEN_SELECT`)는 칼럼을 지정해 조회하므로 노출되지 않는다. 관리자 API 노출은 필요할 때 별도 결정한다 |
| 보존·파기 | 주문 데이터와 같은 보존 기간·파기 범위다. T-30 주문 파기로 `orders` 행이 지워지면 함께 지워진다. CSV·백업·로그 복제본은 T-30 정책을 따른다 |
| 기존 신고 API | `setTransferReported`의 `transfer_reported_at IS NULL` 조건부 UPDATE를 그대로 쓰며 새 주기 재신고가 가능하다. 앱 코드 변경 없음 |

별도 테이블을 쓰지 않은 이유: 신고 API까지 바꿔야 하고 RLS·권한·파기 대상이 늘어나지만, 이력은 주문 1건에 종속된 소량의 시각뿐이라 얻는 것이 적다. 주문 간 신고 이력 집계가 필요해지면 그때 별도 테이블로 옮긴다.

## 연결 (후속, 다른 담당)

- **BE1(#155):** 상태 규칙에 `revert_to_pending`(cooking → pending, transfer, admin, 사유 필수)을 추가하고 이 RPC에 연결한다. 오류 매핑: `ORDER_NOT_FOUND` 404, `INVALID_TRANSITION` 409, `REASON_REQUIRED`·`VALIDATION_ERROR` 400(기존 매핑 기준). 취소 거절 → 입금 확인 → 되돌리기 → 고객 재요청 실제 API 테스트.
- **API(@eunjo01 담당):** 운영 `0107` 적용 후 고객 `ORDER_BY_TOKEN_SELECT`·관리자 `ORDER_QUERY_SELECT`에 `pending_since` SELECT 연결, UTC ISO 응답.
- **관리자 화면 버튼:** 별도 UI 작업.

## 검증

`tests/integration/t55-pending-cycle.test.ts` (실제 Supabase): 대상 외·사유/관리자 검증과 경계값(1·200·201자), 재고·과거 거절 이력 보존, 취소 재요청·송금 재신고, 복수 되돌리기 신고 이력 누적, 레거시 NULL/새 주기 만료, 시계 차이, 관리자 2명 동시 되돌리기, T-19 자동 완료 ↔ 되돌리기·T-18 만료 ↔ 새 주기 신고 양방향 행 잠금 선점, 이력 INSERT 실패 전체 롤백, anon/authenticated RPC 거부.

## 배포

`dev` 병합은 #161(T-54 서비스)이 먼저 병합된 뒤 최신 `dev`로 CI를 재실행해 진행한다. 운영 순서는 `0105 → 0106 → 0107 → 0108`이며, `0107` 운영 적용·권한 확인은 별도 승인 뒤 DB1 담당이다. `pending_since`를 조회하는 앱은 `0107` 적용 후 배포한다.
