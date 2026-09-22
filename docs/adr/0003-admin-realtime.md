# ADR-0003: 관리자 대시보드 실시간 반영 — Supabase Realtime 구독 + 폴링 폴백

> 상태: 승인 (2026-09-22, 사용자)
> 날짜: 2026-09-22

## 맥락

F-21(새 주문이 3초 이내 새로고침 없이 표시), F-31(연결 끊김 10초 지속 시 배너, 복구 후 재동기화), F-43·F-45(송금 신고·취소 요청이 대시보드에 즉시 강조), N-07("Supabase Realtime으로" 명시). 관리자 동시 접속은 2~3계정(태블릿·PC 합쳐 5개 이하로 추정).

## 검토한 대안

| 대안 | 장점 | 단점 |
|---|---|---|
| A. Supabase Realtime `postgres_changes` 구독(orders INSERT/UPDATE) 단독 | 지연 1초 이내(추정), 서버 부하 없음, PRD N-07이 지명 | 구독 끊김 시 변경 유실 → 재동기화 로직 필요. 무료 티어 동시 연결·메시지 한도(추정 — 구현 시 확인) |
| B. 폴링 단독(`GET /api/admin/orders` 2초 주기) | 구현 단순, 끊김 감지가 곧 폴링 실패 | 2초 폴링 × 관리자 5개 = 축제 2일 약 43만 요청 → Vercel 함수 호출·Supabase 요청 낭비. 3초 한계에 항상 근접 |
| C. A + 폴백 폴링(채널이 `SUBSCRIBED`가 아닐 때만 5초 폴링) + 복구 시 전체 재조회 | 정상 시 A의 장점, 끊김 시 B로 자동 강등, 유실분은 재조회로 메움 | 상태 병합 로직(Map by id, updated_at 비교) 필요 |

## 결정

**C.** 결정적 이유: N-07이 Realtime을 지명했고, F-31의 "복구 후 누락 주문 재동기화"는 어차피 재조회 경로를 요구하므로 그 경로를 폴백 폴링으로 재사용한다.

메커니즘(`src/features/admin/useOrdersFeed.ts`):
1. 초기 로드: `GET /api/admin/orders?date=오늘(KST)` → `Map<orderId, AdminOrderDto>`.
2. 채널 `orders-feed`: `postgres_changes` `{event:'*', schema:'public', table:'orders'}`. INSERT → `GET /api/admin/orders/{id}`로 항목 포함 DTO 하이드레이션 후 Map에 추가. UPDATE → 행 필드로 Map 갱신(`updated_at`이 더 새로울 때만).
3. 연결 감시(`useConnectionMonitor`): (a) 채널 상태가 `SUBSCRIBED`가 아님, 또는 (b) `GET /api/health` 5초 주기 실패 — 둘 중 하나가 **10초 연속** 지속되면 `disconnected=true`(배너). 5초 미만 일시 끊김은 배너 없음(F-31). 
4. `disconnected` 동안 5초 폴링(1번과 같은 요청)으로 강등. 복구(채널 `SUBSCRIBED` 복귀 + health 성공) 시 1번 전체 재조회 1회 → 배너 제거.
5. 미확인 수 = Map에서 `acknowledgedAt == null && status ∈ {pending, paid, cooking}` 개수 — 서버 값이 아니라 클라이언트 파생값(서버 응답에도 `unacknowledgedCount`를 주지만 초기값 용도).

RLS 전제: `authenticated` 역할에 `orders` SELECT 정책 + `supabase_realtime` publication에 `orders` 추가. anon은 정책 없음(구독 불가).

고객 상태 페이지(F-10)는 Realtime을 쓰지 않고 5초 폴링(`GET /api/orders/{token}`) — 익명 Realtime 연결 수를 0으로 유지해 무료 티어 한도를 관리자 몫으로만 쓴다(DECISIONS #12).

## 결과 (트레이드오프 포함)

- 얻는 것: 정상 상태 지연 1초 안팎(추정), 끊김 시에도 5초 이내 데이터 갱신, F-31 요구 전부 한 훅에서 처리.
- 감수하는 것: 클라이언트 병합 로직 테스트 필요(단위: INSERT 후 UPDATE 순서 뒤바뀜, 오래된 UPDATE 무시). Realtime 무료 한도(동시 연결 200·월 메시지 200만 — 추정, 구현 시 Supabase 요금 페이지 확인)는 관리자 5연결 × 2일에서 여유 있음(추정).
