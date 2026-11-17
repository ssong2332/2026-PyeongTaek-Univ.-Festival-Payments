# T-55 `0107` DB 계약 초안 — DB1 검토용

이 문서는 #155의 확정 정책을 SQL로 구체화한 **검토 초안**이다. DB1 담당자의 설계 검토와 #161(T-54 서비스) 병합 전에는 `dev` 병합·운영 DB 적용을 진행하지 않는다. 고객/관리자 API의 SELECT 변경과 관리자 액션/UI는 별도 후속 PR이다.

## 제안 계약

| 항목 | 초안 |
|---|---|
| 마이그레이션 | `0107_pending_cycle_revert.sql`, `0106` 뒤·`0108` 앞 |
| 새 컬럼 | `orders.pending_since timestamptz NULL`: 초기/레거시 주문은 NULL이며 `created_at`을 만료 기준으로 사용. 성공한 되돌리기만 비 NULL로 기록 |
| 신고 이력 | `orders.transfer_reported_history timestamptz[]`: 되돌릴 때 현 주기의 `transfer_reported_at`을 추가한 뒤 현 주기 값을 NULL로 초기화. 이전 신고 시각은 보존하고 기존 고객 신고 API의 NULL 조건으로 새 주기 재신고가 가능 |
| RPC | `revert_transfer_order_to_pending(p_order_id uuid, p_actor_id uuid, p_reason text) RETURNS public.orders`; `SECURITY INVOKER`, `search_path=pg_catalog`, `service_role`만 EXECUTE |
| 이력 action | `revert_to_pending`, `cooking → pending`, `actor_type=admin`, 공백 제거한 사유와 관리자 ID 저장 |

RPC는 주문 행을 잠근 뒤 **계좌이체 `cooking`**만 허용한다. 사유는 공백 제거 후 1~200자이며 관리자 ID는 필수다. 한 트랜잭션에서 `status='pending'`, `pending_since=되돌린 시각`, `cancel_requested_at=NULL`, `cancel_rejected_at=NULL`, 결제·조리 시작 시각 NULL, 현 주기 신고 표시 NULL, 상태 이력 1행을 기록한다. 재고는 건드리지 않는다. 이전 `cancel_request_reject` 이력은 삭제하지 않으며, 고객은 새 주기에서 취소를 다시 요청할 수 있다.

`sweep_order_timeouts`는 기존 T-19 자동 완료·설정 검증·행 잠금·오류 처리를 유지한다. 결제대기 만료에만 `COALESCE(pending_since, created_at)`을 적용한다. 새 주기의 송금 신고가 없으면 만료되고, 신고가 있으면 제외된다. 레거시 NULL 주문은 기존 `created_at` 기준·송금 신고 제외 규칙을 유지한다.

## 검증 및 인계

- 격리 Supabase 통합 테스트: 대상·사유 제한, 재고/기존 거절 이력 보존, 취소 재요청·송금 재신고, 레거시 NULL/새 주기 만료, 동시 관리자 1건만 성공, 익명/인증 사용자 RPC 실행 거부.
- DB1은 `transfer_reported_history` 배열을 신고 이력으로 채택할지 검토해야 한다. 감사 저장 형식을 변경한다면 API의 새 주기 재신고 가능성과 과거 시각 보존을 함께 검증한다.
- BE1은 DB 병합 후 관리자 액션·오류 매핑, 고객 취소 재요청 실제 API, 새 주기 신고/만료 경합을 연결한다. API 담당은 운영 `0107` 선적용 후 `pending_since` SELECT와 UTC ISO 응답을 연결한다.
- 운영 DB의 `0106 → 0107` 적용과 권한 확인은 별도 승인 뒤 DB1 담당이다. `0108`/Storage와 T-30 파기 SQL은 각자의 병합·운영 게이트를 유지한다.
