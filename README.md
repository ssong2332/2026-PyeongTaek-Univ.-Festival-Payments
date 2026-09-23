# 2026 평택대 축제 부스 QR 주문·결제 시스템

축제 방문객이 QR로 접속해 메뉴·옵션을 고르고 현금 또는 송금(계좌이체·카카오페이·토스 개인 송금)으로 주문하고, 부스 운영진이 실시간 대시보드에서 입금 확인·조리·완료를 처리하는 웹 서비스.

| 항목 | 값 |
|---|---|
| 개발 마감 | 2026-10-04 (1차) · 10-05~06 (2차) |
| 축제 | 2026-10-07 ~ 10-08, 부스 1개, 예상 200건/일 |
| 스택 | Next.js(App Router) + React + TypeScript + Tailwind CSS / Supabase(PostgreSQL·Auth·Realtime) / Vercel |
| 결제 | 현금 · 송금(계좌이체·카카오페이·토스) — PG 없음(사업자 없음), 관리자 수동 확인 |

## 문서 (읽는 순서)

| 순서 | 문서 | 내용 | 상태 |
|---|---|---|---|
| 1 | [docs/PRD.md](docs/PRD.md) | 요구사항 F-01~F-48, 비기능 N-01~N-17, 화면 12개, 성공 기준, Open Questions | 승인 (2026-09-22) |
| 2 | [docs/Architecture.md](docs/Architecture.md) | 상태 머신, DB 스키마, RLS, API 규격, 폴더 구조, 테스트 전략, 배포 | 승인 (2026-09-22) |
| 3 | [docs/DECISIONS.md](docs/DECISIONS.md) · [docs/adr/](docs/adr/) | 기술 결정 38건, ADR 9건(데이터 접근 경로·주문 트랜잭션·실시간·설정·다국어·스윕·테스트 DB·전화번호 암호화·속도 제한) | 승인 |
| 4 | [docs/Tasks.md](docs/Tasks.md) | 작업 T-01~T-52, 담당 열, 선행 관계, 일정 골격, 인수인계 메모 | — |
| 5 | [docs/GitWorkflow.md](docs/GitWorkflow.md) · [docs/DefinitionOfDone.md](docs/DefinitionOfDone.md) · [docs/CodingRules.md](docs/CodingRules.md) | 브랜치·커밋 규칙, 완료 판정 체크리스트, 코딩 규칙·검증된 명령어 | — |

문서 충돌 시 우선순위: PRD > Architecture > DECISIONS/ADR > CodingRules > GitWorkflow > DefinitionOfDone > Tasks.

> 이 문서 체계는 초기 기획을 AI 에이전트 파이프라인으로 진행하며 만들어졌고, 하네스 자체는 2026-09-22 리포에서 제거했다. 문서에 남은 에이전트 역할 표현은 팀 역할로 바꿨다 — 판정·상태 전환은 팀장, 구현·자가 점검은 담당 팀원, 최종 확인은 리뷰어(다른 팀원)다.

## 팀 구성과 담당

| 약어 | 역할 | 담당 폴더 |
|---|---|---|
| FE1 | 프론트·디자인 — 고객 화면 | `src/app/(customer)`, `src/components/customer`, `src/features/customer`, `src/lib/i18n`, `messages/` |
| FE2 | 프론트·디자인 — 관리자 화면 | `src/app/admin`, `src/components/admin`, `src/features/admin` |
| BE1 | 백엔드 — 주문 도메인 | `src/domain/order`, `src/services`, `src/app/api` (주문·상태 전환) |
| BE2 | 백엔드 — 관리자·조회·인프라 | `src/app/api` (관리자·조회), `src/infra/supabase`, `src/lib/api`, 배포·CI |
| DB1 | DB — 스키마·트랜잭션 | `supabase/migrations` (스키마·함수·RLS), 시드 |
| DB2 | DB — 스윕·집계 | `supabase/migrations` (스윕 함수), `src/domain/stats`, 집계·CSV |
| 팀장 | 상태 전환·리뷰 판정·Open Questions 답변 | `docs/Tasks.md` 상태 열 |

작업별 배정은 [docs/Tasks.md](docs/Tasks.md) "담당" 열. 각 폴더의 책임은 폴더 안 `README.md` 한 줄.

## 일정

| 구간 | 기간 | 작업 |
|---|---|---|
| 0 기반 | 09-23 ~ 09-24 | T-01 하네스·CI → T-02 Supabase 연결 → T-03 스키마 → T-36 시드 (BE1·DB1). FE1·FE2는 Figma 화면 설계 |
| 1 병렬 | 09-25 ~ 09-30 | 선행이 풀린 1차 작업 병렬 |
| 2 통합 | 10-01 ~ 10-03 | T-24 E2E · T-25 배포 · T-30 운영 문서 |
| 버퍼 | 10-04 | 잔여·결함 수정 |
| 2차 | 10-05 ~ 10-06 | T-26~T-29 우선, 나머지는 여력 시 |

임계 경로: T-01 → T-03 → `create_order` 함수 → T-07/T-08 → T-09 → T-24 → T-25.

## 작업 규칙 요약

- **T-01(테스트 하네스 + CI)이 첫 작업** — 완료 전 다른 작업 착수 금지.
- 새 기능은 실패하는 테스트부터(Red-Green-Refactor). 테스트 없는 기능은 미완료.
- `dev`·`main` 직접 커밋 금지. 최신 `dev`에서 기능 브랜치를 만들고 PR은 `dev` 대상으로 요청한다. `main`은 최종 완성본 반영에 사용한다. 브랜치 `feat/T-xx-설명`, 커밋은 Conventional Commits, 병합 전 [DefinitionOfDone](docs/DefinitionOfDone.md) 통과.
- 실제 `.env`는 커밋하지 않는다. 계좌번호·송금 링크는 코드에 넣지 않고 설정 테이블로(ADR-0004).
- 작업 상태(대기→진행→검증중→완료)는 팀장만 바꾼다. 팀원은 구현·테스트 근거를 첨부해 "검증 전환 요청".

## 폴더 구조

```
src/
├── app/            # Next.js App Router — (customer)/ admin/ api/
├── components/     # 표현 컴포넌트 — customer/ admin/ ui/
├── features/       # 화면 상태 훅 — customer/ admin/
├── domain/         # 순수 TS 규칙 — order/(상태 머신·가격) stats/
├── services/       # 유즈케이스 (포트 호출)
├── infra/          # supabase/ repositories/ (SQL·RPC는 여기만)
└── lib/            # api/ dto/(zod) i18n/
supabase/migrations/  # 0001_schema ~ 0006_rate_limit
tests/                # unit/ integration/ e2e/
messages/             # ko.json / en.json
```

## 실행·빌드·테스트

Node 버전은 `.nvmrc`(20.20.2)를 사용한다. 먼저 `node --version`으로 확인한다.

```bash
npm ci
npm run dev
```

개발 서버는 http://localhost:3000 에서 열며 종료는 Ctrl+C다.

```bash
npm run lint
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

단위 테스트는 DB 없이 실행한다. E2E는 포트 3100의 개발 서버를 자동 시작·종료하며 현재 스모크에는 DB가 필요 없다.
Node 버전 선택 도구가 있다면 `.nvmrc`를 적용한다(예: nvm 사용자는 `nvm install` 후 `nvm use`).

검증 결과와 남은 GitHub 설정: [T-01 검증 기록](docs/T-01-validation.md).


## Supabase 연결 준비 (T-02)

1. 팀 Supabase 프로젝트가 준비되면 루트의 `.env.example`을 `.env.local`로 복사한다.
2. `.env.local`에 프로젝트 주소, 공개 키, 서버 전용 키를 입력한다. 이 파일은 Git에 올라가지 않는다. 실제 키를 채팅·PR·문서에 붙이지 않는다.
3. Node 20.20.2에서 `npm ci`를 실행한 뒤 `npm run test:connection`으로 실제 연결을 확인한다.

`test:connection`은 Auth 관리자 API로 사용자 목록 최대 1건을 읽어 연결을 확인하며, 사용자 정보나 키를 출력하지 않는다. 데이터 생성·수정·삭제는 하지 않는다. 테이블·주문 규칙 검증은 T-03 이후 작업이다.

일반 개발은 `npm run dev`, DB 없는 검사는 `npm run test`를 사용한다. 서버의 데이터 접근에는 `src/infra/supabase/server.ts`의 `createServiceClient()`를 사용한다. 호출하는 관리자 API의 인증 검사는 T-13에서 추가해야 한다.
관리자 브라우저의 Auth·Realtime 연결에는 `createAdminBrowserClient()`를 사용한다. 고객 화면은 Supabase에 직접 접근하지 않고 `/api`를 호출한다. 쿠키 세션·로그인 보호(`session.ts`, `requireAdmin`)는 T-13, DB 타입 생성은 스키마 작성 후에 추가한다.

### GitHub의 테스트 DB

팀의 Docker 설치 불가 방침에 따라 통합 테스트는 GitHub Actions의 `integration` 작업에서 실행한다. 테스트마다 독립된 로컬 Supabase를 켜고 접속 정보를 자동으로 읽으므로 원격 프로젝트나 GitHub Secrets는 필요 없다. 종료 시 테스트 환경을 정리한다.
`unit-build`와 `integration`은 모든 코드 업로드 및 `dev`·`main` 대상 PR에서 실행된다. `dev` 개발 흐름은 [GitWorkflow](docs/GitWorkflow.md)를 따른다.

Docker를 사용할 수 있는 환경에서만 Supabase CLI 2.117.0으로 `supabase start`를 실행하고, `.env.test.example`을 `.env.test.local`로 복사해 `supabase status`의 로컬 값을 입력한 뒤 `npm run test:integration`을 실행한다. 통합 테스트는 원격 주소를 거부하고 파일을 순서대로 실행한다.

2026-09-23 팀 Supabase 프로젝트에 대한 읽기 전용 연결 검사 1개가 통과했다. Node 20.20.2에서 단위 검사 27개·코드 규칙 검사·빌드도 통과했다. GitHub의 독립 테스트 DB를 사용하는 `integration` 작업은 업로드 후 별도로 확인해야 한다.
