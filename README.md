# 2026 평택대 축제 부스 QR 주문·결제 시스템

축제 방문객이 QR로 접속해 메뉴·옵션을 고르고 현금 또는 계좌이체로 주문하고, 부스 운영진이 실시간 대시보드에서 입금 확인·조리·완료를 처리하는 웹 서비스.

| 항목 | 값 |
|---|---|
| 개발 마감 | 2026-10-05 (프로토타입 1 09-28 → 2 10-01 → 3 10-03 → 통합 10-04) |
| 축제 | 2026-10-07 ~ 10-08, 부스 1개, 예상 200건/일 |
| 스택 | Next.js(App Router) + React + TypeScript + Tailwind CSS / Supabase(PostgreSQL·Auth·Realtime) / Cloudflare Workers |
| 결제 | 현금 · 계좌이체 두 가지 — 간편결제(카카오페이·토스)·PG 없음(2026-09-24 확정, PRD Open Question #40), 관리자 수동 확인 |

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

프로토타입 방식(2026-09-23 확정). 작업별 날짜와 분류 기준은 [docs/Tasks.md](docs/Tasks.md) "일정 계획" 절.

| 단계 | 기간 | 목표 |
|---|---|---|
| P0 기반 | 09-23 ~ 09-24 | T-01 하네스·CI → T-02 Supabase 연결 → T-03 스키마 → T-36 시드. FE는 Figma |
| P1 프로토타입 1 | 09-25 ~ 09-28 | 핵심 주문 루프를 현금 결제로 완성(메뉴 → 주문 → 관리자 확인 → 고객 상태 확인). 배포는 09-25 준비 후 자동 재배포, 09-28은 여유·데모일 |
| P2 프로토타입 2 | 09-29 ~ 10-01 | 송금 결제 안내 + 실제 운영용 안전장치(취소·환불, 자동 만료, 재고 관리, 속도 제한 등) |
| P3 프로토타입 3 | 10-02 ~ 10-03 | 운영 편의·정산 기능, 우선순위 순(10-04 18시까지 착수 못 한 것은 제외 — 2026-09-24 변경) |
| 통합 | 10-04 | T-24 E2E · T-29 k6 · T-30 운영 문서 · 최종 배포 점검 |
| 마감 | 10-05 | 전원 실기기 리허설, 결함 수정 |

임계 경로(P1): T-01 → T-03 → `create_order` 함수 → T-07/T-08 → T-09(09-27). 09-28은 통합 확인·결함 수정·데모 여유일.

## 작업 규칙 요약

- **T-01(테스트 하네스 + CI)이 첫 작업** — 완료 전 다른 작업 착수 금지.
- 새 기능은 실패하는 테스트부터(Red-Green-Refactor). 테스트 없는 기능은 미완료.
- `main`·`dev` 직접 커밋 금지. 작업 브랜치는 `dev`로 PR — **`dev`가 배포 기준 브랜치**라 병합하면 바로 실제 서비스 주소에 반영된다(2026-09-23). 브랜치 `feat/T-xx-설명`, 커밋은 Conventional Commits, 병합 전 [DefinitionOfDone](docs/DefinitionOfDone.md) 통과.
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
supabase/migrations/  # 번호 배정은 Architecture 2-1절
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

2026-09-23 팀 Supabase 프로젝트에 대한 읽기 전용 연결 검사 1개가 통과했다. Node 20.20.2에서 단위 검사 27개·코드 규칙 검사·빌드도 통과했다. GitHub의 독립 테스트 DB를 사용하는 `integration` 작업도 통과했다. [CI 성공 근거](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/actions/runs/35806617781).

## 운영 폴백 절차 (T-30)

> 축제 운영 중 웹 서비스 또는 네트워크에 문제가 발생했을 때 주문을 중단하지 않기 위한 대응 절차다.
> Cloudflare Workers 배포 URL 및 관리자 계정 관련 최종 정보는 T-25 완료 후 확정한다.

### 1. 장애 발생 시 기본 대응

다음 중 하나가 발생하면 서비스 장애로 판단한다.

* 고객 QR 접속 불가
* 메뉴판 또는 주문 화면이 정상적으로 열리지 않음
* 주문 버튼을 눌러도 주문이 생성되지 않음
* 관리자 대시보드에서 서버 연결 끊김 안내가 지속됨
* `GET /api/health` 확인 실패

일시적인 네트워크 문제일 수 있으므로 먼저 모바일 데이터 또는 다른 네트워크에서 서비스 접속을 다시 확인한다.

복구되지 않으면 즉시 수기 주문 방식으로 전환한다.

### 2. 종이 메뉴판 및 수기 주문 전환

서비스 장애 시 고객 주문은 준비된 종이 메뉴판을 사용한다.

운영진은 주문마다 다음 항목을 기록한다.

* 임시 주문 번호
* 메뉴
* 옵션
* 수량
* 총 금액
* 결제수단
* 주문 시각
* 완료 여부

장애 중에는 가능한 한 **현금 결제를 우선 안내**한다.

송금을 받아야 하는 경우 고객에게 화면 또는 별도 안내판에 적힌 계좌번호와 정확한 주문 금액을 직접 안내한다.

서비스 복구 후 수기 주문을 시스템에 다시 입력하는 기능은 T-28 범위이며, 해당 기능이 구현되지 않은 경우 수기 기록을 당일 정산 자료와 함께 보관한다.

### 3. QR 코드 변조 확인

QR 인쇄물에는 접속 도메인을 함께 표시한다.

운영진은 다음 시점에 QR 코드와 인쇄된 접속 주소가 교체되거나 훼손되지 않았는지 확인한다.

* 부스 운영 시작 전
* 운영진 교대 시
* 운영 중 1시간 간격
* QR 스티커 또는 안내판 위치가 변경된 경우 즉시

QR을 직접 스캔하여 실제 `*.workers.dev` 서비스 주소로 연결되는지도 함께 확인한다.

다른 주소로 연결되거나 QR이 덧붙여진 흔적이 있으면 해당 QR을 즉시 제거하고 예비 인쇄물로 교체한다.

### 4. 장애 발생 시 연락 순서

장애를 발견한 운영진은 다음 순서로 공유한다.

1. 현장 운영진에게 수기 주문 전환 알림
2. 팀장에게 장애 상황 전달
3. 배포/백엔드 담당자에게 Cloudflare Workers 상태 확인 요청
4. DB 담당자에게 Supabase 상태 확인 요청
5. 복구 확인 후 운영진 전체에 정상 운영 재개 전달

장애 보고 시 다음 정보를 함께 전달한다.

* 장애 발생 시각
* 고객 화면 또는 관리자 화면 중 어느 쪽에서 발생했는지
* 오류 메시지
* 모바일 데이터 등 다른 네트워크에서도 동일한지
* `/api/health` 정상 여부

### 5. 송금 정보 변경

송금 정보는 코드에 직접 입력하지 않고 `app_settings`에서 관리한다.

기본 변경 경로는 관리자 대시보드의 설정 패널이다.

변경 가능한 항목은 다음과 같다.

* 은행명
* 계좌번호
* 예금주

간편결제(카카오페이·토스 송금 링크)는 사용하지 않는다(2026-09-24). 고객 화면은 계좌 정보·주문 금액·[계좌번호 복사] 버튼과 "입금자명에 픽업 번호" 안내만 표시한다.

관리자 설정 화면을 사용할 수 없는 경우 Supabase Table Editor에서 `app_settings` 값을 직접 수정한다.

실제 계좌번호와 송금 URL은 GitHub 저장소, 코드, 커밋 메시지 또는 문서에 기록하지 않는다.

### 6. 축제 당일 배포 동결

축제 운영일인 2026-10-07 ~ 2026-10-08에는 긴급 장애 수정이 아닌 일반 기능 추가나 구조 변경을 하지 않는다.

특히 다음 작업은 운영 중 수행하지 않는다.

* DB 스키마 변경
* 불필요한 `dev` 브랜치 병합
* 송금 방식 구조 변경
* 주문 상태 머신 변경
* 검증하지 않은 환경변수 변경

긴급 수정이 필요한 경우 수정 후 최소한 메뉴판 접속 → 주문 생성 → 관리자 확인까지 스모크 테스트한 뒤 운영을 재개한다.

### 7. T-25 완료 후 추가할 항목

다음 내용은 실제 배포가 완료된 뒤 확정한다.

* 실제 `*.workers.dev` 운영 URL
* Cloudflare Workers 장애 확인 위치
* 이전 배포 버전으로 롤백하는 실제 절차
* Supabase 관리자 계정 생성 절차 — 초안: [관리자 계정 생성 절차](docs/T-30-admin-accounts.md) (DB1 서동혁). 운영 회원가입 차단이 계정 생성보다 먼저다
* 실제 운영 관리자 계정 준비 여부 — 위 문서의 "준비 현황" 표에 기록

### 8. 데이터 파기

주문 데이터 파기 예정일은 **2026-11-08**이다.

구체적인 삭제 스크립트와 실행·검증 절차는 DB2 김 혁이 작성하고, 2026-11-08 실행·확인도 김 혁이 맡는다(2026-09-24 결정).

이번 축제 범위에서는 전화번호 수집 기능을 사용하지 않으므로 전화번호 파기는 현재 대상이 아니다. 향후 T-49가 구현되는 경우 전화번호와 관련 동의 기록도 파기 대상에 포함한다.
