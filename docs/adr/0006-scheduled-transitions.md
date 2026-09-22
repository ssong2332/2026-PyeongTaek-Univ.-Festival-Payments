# ADR-0006: 시간 기반 자동 전환(만료·자동 완료) 실행 방식 — pg_cron 1분 주기 + 대시보드 스윕 폴백

> 상태: 승인 (2026-09-22, 사용자)
> 날짜: 2026-09-22

## 맥락

F-17(결제대기 10분 경과 → 만료 + 재고 복구, 송금 신고 주문 제외), F-24(자동 완료 ON 시 조리중 N분 경과 → 완료). 둘 다 "시간이 지나면 시스템이 상태를 바꾼다"이며 Vercel 서버리스에는 상주 프로세스가 없다. 비용 0원(N-14).

## 검토한 대안

| 대안 | 장점 | 단점 |
|---|---|---|
| A. Vercel Cron → `/api/cron/sweep` | Vercel 안에서 완결 | Hobby 플랜 크론은 실행 빈도 제한이 커서(추정: 1일 1회 수준) 1분 주기 불가. 크론 시크릿 관리 추가 |
| B. Supabase `pg_cron` 확장으로 매 1분 `SELECT sweep_order_timeouts()` | DB 안에서 완결, 앱 서버 무관, 대시보드가 닫혀 있어도 동작 | 무료 티어에서 `pg_cron` 활성화 가능 여부는 추정 — T-02에서 확인. 1분 granularity: 10분 경계 후 최대 60초 지연 |
| C. 대시보드 하트비트가 30초마다 `POST /api/admin/sweep` 호출(요청 시 스윕) | 확장 불필요, 축제 중 대시보드는 항상 열려 있음 | 대시보드가 모두 닫히면 멈춤. 관리자 창 N개가 중복 호출(스윕 함수가 멱등이라 결과는 안전) |
| D. 만료를 조회 시점에 lazy 계산(상태 컬럼은 그대로, 읽을 때 `expired`로 보임) | 잡 불필요 | 재고 복구·이력 기록이 "언제" 일어나는지 불명확, 통계 시점 의존 — N-02 검증 불가 |

## 결정

**B를 1차 경로, C를 폴백으로 둘 다 구현한다.** 결정적 이유: 실행 주체가 달라도 하는 일은 멱등 함수 `sweep_order_timeouts()` 하나이므로 두 경로의 추가 비용이 호출부 각 10줄 이하다. B의 무료 티어 가용성이 추정이므로 C가 없으면 F-17이 사용자 개입 없이는 보장되지 않는다.

규격:
- `sweep_order_timeouts(p_now timestamptz DEFAULT now()) RETURNS jsonb` — `{expired: int, completed: int}`. `p_now`는 테스트 경계값(9분59초/10분) 주입용.
  - 만료 대상: `status='pending' AND transfer_reported_at IS NULL AND created_at <= p_now - make_interval(mins => payment.expire_minutes)`. 각 건에 `transition_order(id, 'pending', 'expired', 'expire', 'system', NULL, NULL, NULL)` 호출 → 재고 복구 + 이력(주체 system).
  - 자동 완료 대상: `auto_complete.enabled='true' AND status='cooking' AND cooking_started_at <= p_now - make_interval(mins => auto_complete.minutes)` → `transition_order(id, 'cooking', 'completed', 'auto_complete', 'system', …)`.
  - 결제확인(paid) 상태는 대상 아님(F-24 "조리중→완료만").
  - 각 건은 CAS로 전환하므로, 스윕 직전에 관리자가 입금 확인해 상태가 바뀐 주문은 건너뛴다(F-17 "만료 직전 입금 확인 시 만료 안 됨").
- pg_cron: 마이그레이션에서 `CREATE EXTENSION IF NOT EXISTS pg_cron; SELECT cron.schedule('sweep-orders', '* * * * *', $$SELECT public.sweep_order_timeouts()$$);` — 확장 불가 시 이 마이그레이션은 건너뛰고(별도 파일로 분리) T-02 근거 열에 "pg_cron 불가 → C 단독"을 기록.
- 폴백 C: 대시보드 `useConnectionMonitor`의 30초 틱마다 `POST /api/admin/sweep` (관리자 세션 필요). 응답의 expired>0이면 피드가 Realtime UPDATE로 갱신된다.
- 경계 의미: "10분 경과"는 `created_at + 10분 <= now`. 1분 주기 특성상 실제 만료 시각은 경계 후 0~60초(B) 또는 0~30초(C) 지연 — PRD AC(9분59초 미만료 / 10분 경과 만료)는 함수 수준 통합 테스트로 검증하고, 지연은 운영 문서(T-30)에 명시.

## 결과 (트레이드오프 포함)

- 얻는 것: 대시보드가 닫혀도(B) 또는 pg_cron이 없어도(C) F-17·F-24가 동작. 함수 하나만 테스트하면 두 경로 모두 검증됨.
- 감수하는 것: 설정 변경(예: N을 20으로)은 다음 스윕부터 반영 — 이미 지난 주문은 새 기준으로 재평가된다(F-24 AC "이후 조리중 진입 주문은 20분 기준"과 호환: 기준 시각이 `cooking_started_at`이므로 진입 시점과 무관하게 현재 N을 적용. 더 엄격한 "진입 당시 N 고정"은 요구되지 않음).
