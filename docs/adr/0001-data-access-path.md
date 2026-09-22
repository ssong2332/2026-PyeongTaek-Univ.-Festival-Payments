# ADR-0001: 데이터 접근 경로 — 모든 읽기·쓰기를 Next.js Route Handler 경유로 통일

> 상태: 승인 (2026-09-22, 사용자)
> 날짜: 2026-09-22

## 맥락

Supabase는 클라이언트(브라우저)가 anon 키로 DB에 직접 붙는 방식과, 서버가 service_role 키로 붙는 방식 둘 다 지원한다. 이 프로젝트는 (a) 고객 비로그인(N-04: 고객이 읽을 수 있는 것은 메뉴·자기 주문·대기 수뿐), (b) 가격 서버 재계산(N-03), (c) 상태 머신 강제(F-14), (d) 6명이 합의 없이 병렬 구현(PRD 배경)이라는 제약이 있다. 접근 경로가 둘이면 같은 규칙(권한·검증·상태 전환)을 RLS와 TS 양쪽에 중복 구현해야 하고, 팀원마다 다른 경로를 택해 합쳐지지 않는다.

## 검토한 대안

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 클라이언트가 supabase-js(anon/authenticated)로 직접 읽고 쓰기, RLS로 권한 제어 | 서버 코드 최소, Realtime과 동일 클라이언트 | 고객 토큰 검증·가격 재계산·상태 머신을 RLS/DB 함수로만 표현해야 함(팀 SQL 숙련도 낮음). anon 키로 접근 가능한 표면이 넓어 RLS 실수 1건이 곧 데이터 노출. 6명이 각자 쿼리를 짜면 규칙이 흩어짐 |
| B. 모든 읽기·쓰기를 Next.js Route Handler(`/api/*`)가 service_role로 처리, 클라이언트는 fetch만. 관리자 브라우저는 Auth 세션 + Realtime 구독(읽기)에만 supabase-js 사용 | 검증(zod)·인가(세션/토큰)·상태 머신·DTO 변환이 한 계층에 모임. anon 키에는 테이블 정책을 하나도 안 주므로 RLS 실수 표면 최소. API 규격 표 하나로 프론트·백 분담 가능 | 라우트 핸들러 파일 수 증가(약 20개). 한 홉 추가(Vercel 함수 → Supabase) — 200건/일 규모에서 무시 가능 |
| C. Supabase Edge Functions(Deno)에 로직 배치 | Supabase 안에서 완결 | Next.js와 런타임 2개(Node/Deno) — 팀 학습 부담, 로컬 개발 복잡 |

## 결정

**B.** 결정적 이유: N-03·N-04·F-14의 규칙을 TS 한 계층(`src/services`)에 모아 6명이 같은 API 표를 보고 병렬 구현할 수 있고, anon 키에 테이블 정책이 0개이므로 고객 측 노출 표면이 가장 작다.

세부:
- 고객 브라우저: supabase-js를 쓰지 않는다. `fetch('/api/...')`만.
- 관리자 브라우저: `@supabase/ssr` 브라우저 클라이언트로 로그인·세션 유지 + `orders` 테이블 Realtime 구독(읽기 전용, `authenticated` SELECT 정책 필요). 모든 쓰기는 `/api/admin/*`.
- 서버(Route Handler): `SUPABASE_SERVICE_ROLE_KEY`로 만든 서비스 클라이언트. 관리자 API는 먼저 쿠키 세션의 `getUser()`로 인증 확인 후 서비스 클라이언트로 작업.
- 원자성이 필요한 쓰기(주문 생성·상태 전환·스윕)는 Postgres 함수(ADR-0002)를 RPC로 호출.

## 결과 (트레이드오프 포함)

- 얻는 것: RLS 정책 표가 짧아짐(anon 0개, authenticated는 Realtime용 SELECT만). 에러 규격·검증 위치가 한 곳. 프론트 담당은 API 표만 보고 화면을 만들 수 있음.
- 감수하는 것: `SUPABASE_SERVICE_ROLE_KEY`가 서버 환경변수로 존재 — `NEXT_PUBLIC_` 접두사 금지, 클라이언트 컴포넌트에서 import 금지(코드 리뷰 체크 항목). Vercel 함수 콜드스타트가 p95에 더해짐(N-06은 2차 T-29에서 측정).
- Supabase Auth의 회원가입(Sign-up)을 대시보드에서 반드시 끈다 — 켜져 있으면 누구나 `authenticated`가 되어 관리자 API를 호출할 수 있다(T-25·T-30 절차에 포함).
