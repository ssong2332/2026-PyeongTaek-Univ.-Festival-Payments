# ADR-0009: 주문 생성 속도 제한 — 카운터 저장 위치

> 상태: 승인 (2026-09-22, 사용자)
> 날짜: 2026-09-22

## 맥락

F-47(클라이언트 IP당 분당 5건, 초과 시 429, 주문·재고·픽업 번호 미소비, 같은 멱등키 재요청은 제한과 무관하게 기존 주문 반환, 관리자 API 제외). 사용자 원문 "전부 추천대로, 승인"(PRD Open Question #36). 실행 환경은 Vercel 서버리스 — **함수 인스턴스 간 메모리 공유가 없고 인스턴스 수명이 불확실**하므로 프로세스 메모리 카운터는 인스턴스마다 따로 세어 한도가 사실상 `5 × 인스턴스 수`가 된다. 비용 0원(N-14). 호스팅이 Cloudflare Pages로 바뀔 수 있다(N-14 예외, T-50).

## 검토한 대안

| 대안 | 장점 | 단점 |
|---|---|---|
| A. Route Handler 인메모리 Map 카운터 | 코드 20줄, 외부 의존 없음 | 서버리스 인스턴스마다 별도 카운터 — 콜드 스타트·스케일아웃 시 한도가 무의미(F-47 AC "6번째 요청 429"를 보장 못 함). 로컬 `next dev`에서만 정확 |
| B. Postgres 테이블 카운터(`rate_limits`) + 원자적 `INSERT … ON CONFLICT … WHERE count < limit` 함수 | 이미 있는 Supabase만 사용(비용 0, 시크릿 추가 없음), 인스턴스 무관하게 정확, 통합 테스트로 검증 가능(ADR-0007), 호스팅 전환에 영향 없음 | 주문 생성마다 DB 왕복 1회 추가(200건/일 규모에서 무시 가능). 테이블·함수·RLS 행 추가 |
| C. Vercel Firewall(WAF) 속도 제한 규칙 | 코드 0줄, 앱 도달 전 차단 | 속도 제한 규칙은 Pro 이상 기능(추정 — 무료 Hobby에서 불가하면 N-14 위반). 멱등 재요청 예외(F-47 "기존 주문 반환")를 표현할 수 없음. Cloudflare 전환 시 소멸. 통합 테스트 불가 |
| D. 외부 KV(Upstash Redis 등) 무료 티어 | 서버리스용 정석, 슬라이딩 윈도 라이브러리 | 외부 서비스·시크릿 1개 추가(N-05 관리 대상 증가), 무료 한도는 추정, 로컬 테스트에 별도 스택 필요 |

## 결정

**B.** 결정적 이유: 무료·인스턴스 무관·멱등 재요청 예외를 전부 만족하는 유일한 대안이고, 기존 테스트 격리(ADR-0007)로 F-47 AC를 통합 테스트로 검증할 수 있다.

규격:

- 테이블 `rate_limits(scope text, key text, window_start timestamptz, count int NOT NULL DEFAULT 0, PK(scope, key, window_start))`. RLS: anon·authenticated 거부, service_role 전부.
- 함수 `consume_rate_limit(p_scope text, p_key text, p_limit int, p_window_seconds int, p_now timestamptz DEFAULT now()) RETURNS boolean` — 고정 윈도(`window_start = to_timestamp(floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds)`). `INSERT … ON CONFLICT (scope,key,window_start) DO UPDATE SET count = rate_limits.count + 1 WHERE rate_limits.count < p_limit RETURNING count` → 행이 없으면 `false`. 같은 호출에서 `DELETE FROM rate_limits WHERE window_start < p_now - interval '1 hour'`(청소). `SECURITY INVOKER`, anon·authenticated EXECUTE 거부(0002 함수들과 동일). `p_now` 주입은 테스트용(ADR-0006 `sweep`와 같은 패턴).
- 호출 순서(`orderService.createOrder`): ① `repo.findByIdempotencyKey(key)` → 있으면 즉시 200 반환(**한도 미소비** — F-47 멱등 예외) ② `rateLimitRepo.consume('order_create', clientKey, LIMIT, WINDOW)` → `false`면 `AppError('RATE_LIMITED', 429)` ③ `create_order` RPC. ①과 ③의 이중 멱등 검사는 의도적 — ③이 UNIQUE로 경쟁 상태를 최종 판정한다. `create_order`는 수정하지 않는다(ADR-0002 유지).
- 카운트되는 것: ②를 통과한 요청. ③이 OUT_OF_STOCK 등으로 실패해도 카운트는 남는다(별도 RPC라 롤백되지 않음) — "시도" 기준 한도. F-47 AC(성공 5건 후 6번째 429)와 일치한다.
- 클라이언트 키: `src/lib/api/clientIp.ts` `getClientIp(request)` — `x-forwarded-for` 첫 항목(Vercel이 신뢰값으로 덮어씀 — 추정, T-51에서 프리뷰 배포로 확인) → 없으면 `x-real-ip` → 없으면 `'unknown'`(로컬·테스트). Cloudflare 전환 시 `cf-connecting-ip`를 우선 순위 맨 앞에 추가(코드 1줄). 저장 키는 원본 IP가 아니라 `sha256(ip)` hex 앞 32자 — IP를 평문으로 남기지 않는다(1차 "개인정보 수집 없음" 고지 F-12와의 충돌 회피, 행은 1시간 내 삭제됨). 해시는 `crypto.subtle`/`node:crypto` 어느 쪽이든 서버에서만.
- 한도 상수는 한 곳: `src/domain/order/rateLimit.ts` — `ORDER_CREATE_RATE_LIMIT = { limit: 5, windowSeconds: 60 } as const`. 변경은 코드 수정 + 배포(Open Question #39 결정 시 `app_settings` 키로 승격할 수 있다 — 그때 ADR-0004 키 표에 추가).
- 응답: 429 `{ error: { code: 'RATE_LIMITED', message, details: { retryAfterSeconds } } }` + 헤더 `Retry-After: {초}`(윈도 끝까지 남은 초). 클라이언트는 4xx라 자동 재시도 없음(DECISIONS #24) → 수동 재시도 버튼 + 장바구니 유지(F-13 UI 재사용).
- 로그 이벤트 `order.rate_limited`(필드: `keyPrefix`(해시 앞 8자), `count`). IP 원문은 로그 금지.
- 적용 범위: `POST /api/orders`만. `transfer-report`·`cancel-request`는 토큰 소유자 한정 + 멱등이라 남용 표면이 작다 — 요구 없음, 미적용. 관리자 API 미적용(F-47).
- 파기: `supabase/scripts/purge_2026-11-08.sql`에 `TRUNCATE rate_limits` 포함.

## 결과 (트레이드오프 포함)

- 얻는 것: 서버리스에서 정확한 IP당 한도, 무료, 멱등 재요청 무영향, 통합 테스트로 AC 검증(6번째 `false`, `p_now` +60초 후 `true`, 멱등 재요청은 카운트 불변).
- 감수하는 것: 신규 주문당 RPC 1회 추가(약 수십 ms — 추정). 고정 윈도라 경계에서 최대 10건/2분 순간 허용(슬라이딩 윈도 요구 없음). NAT 공유 IP 오차단 가능성은 Open Question #39로 남는다 — 한도가 상수 한 곳이라 변경 비용은 낮다.
