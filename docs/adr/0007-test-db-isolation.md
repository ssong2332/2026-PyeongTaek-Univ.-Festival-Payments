# ADR-0007: 테스트 DB 격리 — Supabase CLI 로컬 스택

> 상태: 승인 (2026-09-22, 사용자)
> 날짜: 2026-09-22

## 맥락

N-13(단위 테스트 목록 + E2E 1개), ADR-0002(핵심 규칙이 Postgres 함수·RLS에 있어 DB 없이는 검증 불가), 6명 병렬 개발(공유 DB에 테스트가 동시에 쓰면 서로 깨뜨림), 비용 0원.

## 검토한 대안

| 대안 | 장점 | 단점 |
|---|---|---|
| A. Supabase CLI 로컬 스택(`supabase start`, Docker) — 개발자마다 독립 DB, `supabase db reset`으로 마이그레이션+시드 재적용 | 완전 격리, 무료, 마이그레이션 파일이 곧 스키마 원본, RLS·Realtime·Auth까지 로컬 재현 | Docker Desktop 설치 필요(팀원 PC 사양·설치 가능 여부 미확인 — Open Question). 첫 기동 이미지 다운로드 수 GB |
| B. Supabase 원격 브랜치(Branching) | 로컬 설치 없음 | 유료 플랜 기능(추정) — N-14 위반 |
| C. 공유 원격 "dev" 프로젝트 1개를 테스트에도 사용 | 설치 없음 | 병렬 테스트가 서로의 데이터를 오염(재고·픽업 번호 카운터). 프로덕션 프로젝트와 별개로 무료 프로젝트 1개 더 필요(무료 티어 프로젝트 수 한도 2개 — 추정) |
| D. 원격 프로젝트에 테스트 스키마 접두사(예: 테스트마다 별도 schema) | 설치 없음 | Postgres 함수·RLS·publication을 스키마마다 복제 — 마이그레이션이 이중화 |

## 결정

**A.** 결정적 이유: ADR-0002의 동시성 테스트(재고 1에 동시 2건)와 RLS 거부 테스트(T-13)는 격리된 실제 Postgres에서만 의미가 있고, A만 무료·격리를 동시에 만족한다.

규격:
- 통합 테스트(`tests/integration/**`)는 환경변수 `SUPABASE_URL=http://127.0.0.1:54321`(로컬 기본값 — 구현 시 `supabase status` 출력으로 확인) + 로컬 anon/service_role 키(로컬 스택이 출력하는 고정 키 — 시크릿 아님, 그래도 `.env.test.example`에 플레이스홀더로만).
- 격리 단위: 테스트 파일 시작 시 `TRUNCATE orders, order_items, order_item_options, order_status_history CASCADE; UPDATE counters SET value = 0` + 필요한 메뉴 픽스처 삽입(`tests/integration/fixtures.ts`). 파일 간 병렬 실행 금지(`vitest --pool=forks --poolOptions.forks.singleFork` 또는 `fileParallelism: false`) — 한 DB를 공유하므로.
- E2E(Playwright)도 로컬 스택 + `next dev`에 대해 실행. 관리자 계정은 `supabase/seed.sql`이 아니라 테스트 셋업에서 로컬 Auth Admin API로 생성(시드에 비밀번호를 두지 않음).
- Docker를 설치할 수 없는 팀원: 단위 테스트(`tests/unit/**`, DB 불필요)만 로컬 실행하고 통합·E2E는 DB 담당 또는 CI(Open Question: CI 도입 여부)에 맡긴다.

## 결과 (트레이드오프 포함)

- 얻는 것: 마이그레이션·RPC·RLS를 커밋 전에 실제로 검증. 프로덕션 DB에 테스트 데이터 0건.
- 감수하는 것: Docker 의존. 통합 테스트 직렬 실행으로 수행 시간 증가(예상 수십 초 — 규모상 허용).
