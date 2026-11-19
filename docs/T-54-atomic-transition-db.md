# T-54 원자적 전환 DB 계약 (DB1)

근거: #155의 2026-11-11 결정 및 2026-11-12 인계, DECISIONS #71.
이 문서는 0106 DB 선행 작업이며 #161의 서비스 연결이나 T-54 전체 완료를 뜻하지 않는다.

## RPC

`public.transition_order_if_cancel_unchanged` → `public.orders` 1행.

| 인자 | 타입 | 의미 |
|---|---|---|
| `p_order_id` | uuid | 주문 ID |
| `p_from` / `p_to` | public.order_status | 조회 당시 상태 / 상태 머신이 결정한 다음 상태 |
| `p_action` | text | 상태 머신이 허용한 동작 |
| `p_actor_type` | public.actor_type | 기존 전환 주체 |
| `p_actor_id` | uuid | 기존 주체 ID |
| `p_reason` | text | 기존 사유 (nullable) |
| `p_refund_channel` | public.refund_channel | 기존 환불 방식 (nullable) |
| `p_expected_cancel_requested_at` | timestamptz | 조회 당시 취소 요청 시각 (nullable, **필수 인자**) |
| `p_expected_cancel_rejected_at` | timestamptz | 조회 당시 취소 거절 시각 (nullable, **필수 인자**) |

1. `orders` 행을 `FOR UPDATE`로 잠근다. 없으면 `ORDER_NOT_FOUND`.
2. 두 기대 시각을 현재 행과 각각 `IS DISTINCT FROM`으로 비교한다. NULL↔값 변화도 `STATE_CHANGED`.
3. 같으면 같은 트랜잭션에서 기존 `transition_order`를 호출한다. 기존 상태 CAS·터미널 방어·시각·재고·이력을 재사용한다.
4. 내부 전환/이력 저장에 실패하면 전체 호출을 롤백한다.

이 래퍼는 허용 상태/결제수단/동작 정책을 새로 정의하지 않는다. 정책의 단일 원본은 `stateMachine.ts`다.
같은 취소 요청 스냅샷을 보냈다는 사실만으로 전환이 허용되는 것은 아니다.

## BE1 연결 (#161에서 별도 구현)

- `findById`에서 상태·결제수단과 두 취소 시각을 **함께** 읽고 상태 머신에서 미결 취소 요청을 먼저 거부한다.
- `confirm_payment`, `confirm_cash`, `start_cooking`은 **항상** 이 RPC를 사용한다. 기대값이 둘 다 NULL이어도 기존 RPC로 우회하지 않는다.
- 두 기대 시각은 해당 조회 결과 그대로 전달한다. 시각 정밀도를 줄이는 포맷 변환이나 새 조회 값으로 교체하지 않는다.
- 다른 동작은 기존 `transition_order` 연결을 유지한다.
- `STATE_CHANGED`는 409, `ORDER_NOT_FOUND`는 404로 기존 오류 매핑을 사용한다. 실패를 성공으로 바꾸거나 기존 함수로 재시도하지 않는다.
- 고객 요청이 먼저 저장되면 래퍼가 거부한다. 관리자가 먼저 잠금/전환을 완료하면 기존 고객 `setCancelRequested` 조건부 UPDATE가 바뀐 상태를 재검사해 0행이 된다.

## 권한·배포

- `SECURITY INVOKER`, `search_path=pg_catalog`.
- PUBLIC/anon/authenticated EXECUTE 제거, service_role에만 부여한다(소유자 권한 제외).
- 기존 `0009_transition_order.sql` 및 다른 앱 코드/PR/브랜치는 수정하지 않는다.
- 번호 순서: 0105 → **0106** → 0107(T-55) → 0108(재고 사진).
- 운영 적용은 별도 승인 후 DB1이 이력/pending 목록을 확인하고 수행한다. 이 PR에서 운영 DB는 변경하지 않는다.
- 0106 DB 적용·권한 검증 후 새 RPC를 호출하는 앱을 배포한다. DB PR 병합만으로 서비스 경합 방어가 활성화되지는 않는다.

## 검증

`tests/integration/t54-atomic-transition.test.ts`는 기존 CI의 격리 로컬 Supabase에서 실행한다.
정상 세 동작, NULL/비NULL 시각 불일치, 거절 후 정상 전환, 고객 먼저/관리자 먼저,
두 발송 순서의 동시 HTTP 요청, 관리자 중복 요청, 없는 주문, 터미널 상태,
이력 실패 시 전체 롤백, anon/authenticated 실행 거부를 확인한다.
동시 HTTP 테스트는 실행 순서를 강제하는 테스트용 DB 함수나 sleep을 추가하지 않고 양쪽 합법 결과를 검증한다.
서비스/API 경합 검증은 BE1의 #161 연결 뒤 추가로 필요하다. 화면 AC는 DB 전용 PR이므로 해당 없음.

적용 후 읽기 전용 확인 예시:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '0106';
SELECT p.oid::regprocedure, p.prosecdef, p.proconfig,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_allowed,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_allowed,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_allowed,
       EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
               WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_allowed
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'transition_order_if_cancel_unchanged';
```

기대값: 함수 1개, prosecdef=false, search_path=pg_catalog,
service_allowed=true, anon/authenticated/public_allowed=false.
