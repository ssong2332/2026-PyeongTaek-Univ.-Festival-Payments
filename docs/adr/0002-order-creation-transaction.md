# ADR-0002: 주문 생성 트랜잭션·멱등키·재고 차감 — Postgres 함수(RPC)

> 상태: 승인 (2026-09-22, 사용자)
> 날짜: 2026-09-22

## 맥락

F-07(주문·항목 생성·재고 차감 단일 트랜잭션, 동시 주문 시 재고 음수 불가), F-08(멱등키 재요청은 기존 주문 반환, 재고 1회만 차감), F-09(축제 전체 연속 픽업 번호, 동시 생성 시 중복 없음), N-01·N-02. Supabase의 HTTP 게이트웨이(PostgREST)는 여러 문장을 하나의 트랜잭션으로 묶는 API가 없다.

## 검토한 대안

| 대안 | 장점 | 단점 |
|---|---|---|
| A. Postgres 함수 `create_order(...)`를 만들고 Route Handler가 `supabase.rpc()`로 호출. 함수 본문이 곧 트랜잭션 | 원자성·잠금·UNIQUE 충돌 처리가 DB 안에서 완결. 네트워크 왕복 1회. 동시성 테스트를 SQL 수준에서 재현 가능 | PL/pgSQL 작성 필요(DB 담당 1~2명 몫). 가격 계산 로직이 SQL에 있어 TS 단위 테스트로는 못 잡음 → 통합 테스트(로컬 Supabase) 필수 |
| B. Route Handler에서 Postgres 직접 연결(`pg`/Drizzle) + `BEGIN…COMMIT`, `SELECT … FOR UPDATE` | 로직 전부 TS, 단위 테스트 친화 | Vercel 서버리스에서 직접 DB 연결은 커넥션 풀러(Supavisor, 트랜잭션 모드) 경유 필수 — 설정 실수 시 커넥션 고갈. supabase-js와 별도의 두 번째 DB 접근 스택(스키마 타입 이중화). 팀 경험 하 |
| C. supabase-js 다중 문장 + 실패 시 보상 트랜잭션(수동 롤백) | 추가 스택 없음 | 원자성 보장 불가 — 재고 차감 후 주문 삽입 실패 시 복구 코드가 또 실패할 수 있음. N-01·N-02 위반 위험 |

## 결정

**A.** 결정적 이유: 원자성과 동시성(N-01·N-02)을 DB 엔진이 보장하고, 실패 모드가 "함수가 예외를 던진다" 하나로 단순하다.

함수 규격(요약 — 본문은 `supabase/migrations/`):

```
create_order(
  p_idempotency_key uuid,
  p_payment_method  payment_method,      -- 'cash' | 'transfer'
  p_transfer_method transfer_method,     -- 'bank' | 'kakaopay' | 'toss' | NULL
  p_locale          text,
  p_items           jsonb                -- [{menuItemId, quantity, optionIds:[...]}]
) returns jsonb  -- {orderId, pickupNumber, statusToken, totalAmount, status, createdAt, created}
```

처리 순서(함수 내부, 단일 트랜잭션):
1. `SELECT … FROM orders WHERE idempotency_key = p_idempotency_key` → 있으면 `created=false`로 즉시 반환 (F-08).
2. 입력 항목마다 `menu_items`를 읽어 판매 가능(`is_active AND NOT is_sold_out_manual AND stock > 0`) 확인, 옵션 ID가 해당 메뉴의 활성 옵션인지·그룹 min/max 충족 확인. 가격은 DB의 `base_price`·`extra_price`만 사용 — 클라이언트 값 없음(N-03).
3. 메뉴별 수량 합산 후 `UPDATE menu_items SET stock = stock - qty WHERE id = … AND stock >= qty` — 영향 행 0이면 `RAISE EXCEPTION 'OUT_OF_STOCK'` (동시 주문 2건 중 1건만 통과; 행 잠금이 직렬화). CHECK(stock >= 0)이 최후 방벽.
4. `UPDATE counters SET value = value + 1 WHERE key = 'pickup_number' RETURNING value` → 픽업 번호 (행 잠금으로 직렬화, 트랜잭션 롤백 시 번호도 롤백 → 빈 번호 없음, 날짜 리셋 없음 F-09).
5. `status_token = encode(gen_random_bytes(32), 'hex')` (64자, 256비트 — F-10).
6. `orders`·`order_items`·`order_item_options` 삽입(이름·가격 스냅샷 포함), `order_status_history`에 `(NULL → pending, action='create', actor=customer)` 1행.
7. `idempotency_key` UNIQUE 충돌(동시 재요청) 시 `unique_violation`을 잡아 1번을 다시 수행해 기존 주문 반환.

동시성 검증(통합 테스트, T-07·T-08): 재고 1인 메뉴에 `create_order` 2건을 병렬 호출 → 정확히 1건 성공·재고 0; 같은 멱등키 2건 병렬 → 주문 1건·재고 1회 차감·픽업 번호 동일.

## 결과 (트레이드오프 포함)

- 얻는 것: N-01·N-02·F-09를 DB 제약(UNIQUE, CHECK, 행 잠금)으로 보장. Route Handler는 zod 검증 + RPC 호출 + DTO 변환만.
- 감수하는 것: 가격 계산 규칙이 SQL과 TS(장바구니 표시용 `domain/order/pricing.ts`) 두 곳에 존재 — 서버 값이 권위이며, 통합 테스트로 두 결과가 일치함을 검증한다. 함수 변경은 마이그레이션 파일로만(직접 편집 금지).
- 상태 전환(`transition_order`)·시간 기반 스윕(`sweep_order_timeouts`)도 같은 이유로 Postgres 함수로 둔다 — 허용 전환 표 자체는 TS 도메인이 단일 원본이고, DB 함수는 CAS(현재 상태 = 기대 상태)·터미널 상태 불변·재고 복구·이력 기록만 강제한다(Architecture.md "주문 상태 머신").
