# CHANGELOG — 2026-PyeongTaek-Univ.-Festival-Payments

> 소유자: docs | 형식: [Keep a Changelog](https://keepachangelog.com/ko/) 축약. 최신이 위.

## [Unreleased]

### Fixed
- 2026-10-02 고객이 메뉴판으로 가거나 사이트를 나갔다 다시 들어오면 주문 현황으로 돌아갈 방법이 없던 문제(Issue #89, P1 QA) — 주문 성공 시 현황 링크·픽업 번호를 기기에 24시간 보관하고 메뉴판에 "내 주문 현황 보기" 진입점 추가, 없는 주문·취소·환불·만료는 목록에서 제거, 개인정보 고지에 보관 안내 한 줄(DECISIONS #54) — 팀장 인수 진행
- 2026-10-02 Architecture 보안 체크(인증·인가)의 `Referrer-Policy: no-referrer`가 설정돼 있지 않던 문제 — 주문 현황 URL(`/orders/{token}`)의 상태 토큰이 Referer로 넘어가지 않게 `next.config.ts` `headers()`로 페이지·API 전 경로에 적용(`tests/unit/nextConfig.test.ts`)
- 2026-10-01 관리자 대시보드: 늦게·역순으로 도착한 상세 조회·목록 조회 응답이 실시간으로 받은 최신 상태(예: 조리중)를 이전 상태(결제대기)로 되돌리던 문제 — `updatedAt` 기준 병합(ADR-0003)을 상세 조회·초기 로드·새로고침에도 적용, 목록 조회 중 실시간으로 받은 주문은 유지(`useOrdersFeed`) — PR #85(릴리스 PR #84 리뷰)
- 2026-10-01 브라우저 API 호출의 8초 타임아웃이 응답 헤더까지만 걸리던 문제 — 본문 수신까지 유지, 본문 수신 중 끊김·지연은 응답 없음(자동 재시도 대상)으로 처리(`lib/api/client.ts`, DECISIONS #24) — PR #85(릴리스 PR #84 리뷰)

### Changed
- 2026-10-04 PRD N-06 기준 명확화: k6 30 RPS는 **전체 사용자 합산**(여러 클라이언트로 분산), 429도 오류로 계산, 속도 제한 규칙은 T-51 통합 테스트로 따로 검증 — 단일 IP 30 RPS는 F-47(IP당 분당 100건)과 양립 불가(PR #108 리뷰에서 발견). 팀장 결정(DECISIONS #57, PRD Open Question #41). N-14 검증 범위도 정리 — 30 RPS 기준 실행은 `next start`(Node.js 서버, 가상 클라이언트 20개 이상)로 고정하고 N-06 합격(오류 0%·API별 p95 1초 이내)은 이 실행으로 판정, 운영 URL은 N-14 운영 검증(30 RPS 판정에 미사용), `next start`·로컬 Workers 실행은 Workers 한도를 거치지 않아 운영 Workers의 30 RPS·Free 한도는 검증 범위 아님, 운영 DB 사용 시 #108 안전한 정리 절차 전 실행 금지, 일일 100,000 요청 한도는 실제 실행량으로 대조. N-14의 옛 "vinext 우선" 문구를 OpenNext 확정(DECISIONS #52)으로 정정, Architecture 호스팅 행 동기화
- 2026-10-04 고객·관리자 화면 디자인 업그레이드(프론트 담당 Figma Make 시각 요소만, 팀장 예외 결정): 크림·피치·코랄·코코아 팔레트 토큰, Pretendard Variable 동적 서브셋(npm `pretendard` 1.3.9, OFL-1.1), 호떡 마스코트 SVG 5종(`public/mascot/`), 메뉴판 헤더 호떡 이미지(Codex 생성, `public/images/hotteok-hero.webp`). 로직·API 변경 없음. 코랄 위 흰 글씨는 대비 기준에 맞게 진한 값으로 조정 — `docs/Design-Changes.md` #58~#65
- 2026-10-04 Tasks·노션 동기화: T-17·T-46 완료(팀장 결정: PR 모두 병합 → 완료), T-19·21·22·32·35·38·41 대기 → 진행, 근거 열 갱신 12행(PR 없는 마감 경과 4행 포함), T-35 담당 열을 FE2 예외(김희진)에 맞춤. T-36은 노션만 진행중으로 다시 엶 — 이 문서는 "완료 행 되돌리지 않음" 규칙과 충돌해 팀장 판단 대기(Tasks 10-04 변경 이력)
- 2026-10-02 운영 계좌 3개 입력 담당 변경: 팀장 → DB1(서동혁). 팀장은 실제 값 1:1 전달·입력 값 대조, DB1은 입력·채움 확인(DECISIONS #55, #47 개정) — `T-30-transfer-settings.md` 순서·4단계 값 대조 추가, `T-30-operations-runbook.md` 4절
- 2026-10-01 **첫 운영 배포** — 릴리스 PR #84(`dev` → `main`, `572a346`)를 Cloudflare Workers Builds(Production branch `main`, 미리보기 빌드 끔)로 배포. `/api/health` 200 `db:true`, 스모크 5단계 통과(현금 주문 → 현금 수령 확인 → 조리 완료). 주소·결과는 `T-25-deployment.md` 7절 — 계정 서브도메인은 바꿀 예정(팀장 결정 10-02) — 새 주소로 다시 확정. 팀장 진행
- 2026-10-01 Cloudflare 변수 규칙 정정(`T-25-deployment.md` 3절, Architecture 배포 절): `NEXT_PUBLIC_*`는 빌드 변수에만, 서버 키는 실행 Secret으로 — 대시보드 일반 실행 변수는 배포(`wrangler deploy`) 때 덮어써짐
- 2026-10-01 배포 기준 변경(PR #50, 유은조 작성·팀장 인수): Node 20 → 22(`.nvmrc` 22.23.3, DECISIONS #51), 배포 어댑터 OpenNext 확정(DECISIONS #52), 운영 배포 브랜치 `dev` → `main`(DECISIONS #53, GitWorkflow·README)
- 2026-10-01 Tasks·노션 동기화(저녁): T-13·T-16 완료(팀장 결정: PR 모두 병합 → 완료), T-25 근거 갱신(진행 유지 — 10-04 최종 점검), T-30 근거 정정(#63·#83 병합), 역할 표 BE2·FE2 인수 메모, `T-30-admin-accounts.md` 운영 URL·로그인 확인 칸
- 2026-10-01 운영 관리자 계정 준비 현황 기록(`T-30-admin-accounts.md`): 운영 회원가입 꺼짐 확인, 관리자 계정 2개로 확정·1개 생성(나머지 1개는 10-06 전 추가), 계정 수 확인 조회 추가 — 팀장 인수 진행
- 2026-10-01 Tasks·노션 동기화: T-05·06·09·10·11·12 완료(팀장 결정: 원작업 PR 모두 병합 → 완료), T-17 대기 → 진행, T-13 진행 유지. 팀장이 인수해 직접 진행한 작업은 Tasks 담당 열에 `팀장(10-01 인수)`, 노션 담당자에 박수홍 추가(Tasks 역할 약어 팀장 행 예외)
- 2026-10-01 메뉴 초기 재고 0 → 메뉴당 100(처음 넣는 값, 운영 중 변경 가능) — PR #81, DECISIONS #50. 운영 DB seed 적용 완료(재고 100×4 확인)
- 2026-10-01 운영 DB에 0017 적용(팀장, SQL Editor — anon·authenticated 실행 불가·service_role만 확인). 다음 `db push` 때 재실행·기록(Architecture 2-1절)
- 2026-10-01 next·eslint-config-next 16.3.5 → 16.3.8(next/og 보안 패치) — PR #75
- 2026-10-01 운영 DB 적용 담당 확정: 마이그레이션 `db push`·seed 운영 적용은 DB1, seed 작성·유지는 DB2, 운영 계좌 입력은 팀장(DECISIONS #47, Tasks 역할 표·T-36, Architecture 배포 절, 신규 `T-30-transfer-settings.md`)
- 2026-10-01 통합 테스트 mock 기준 확정: 동작을 바꾸는 mock(`requireAdmin` 등) 금지, `server-only` 스텁만 허용(DECISIONS #46, Architecture 테스트 절·CodingRules 테스트 작성 기준)
- 2026-10-01 운영 DB 적용 현황 갱신: 0016 적용 확인, seed 미적용(Architecture 2-1절, Tasks T-36)
- 2026-10-01 Tasks 근거 열 갱신: T-16(#54 자체 API 제거 반영)·T-17(PR #72·#58)·T-36(운영 seed 미적용)
- 2026-09-30 운영 DB 마이그레이션 적용 순서 확정: 0016 → 0017 → 0018 → 0019, 병합 전 0014(#62)·0015(#52)는 0018·0019로 이름 변경(DECISIONS #45, Architecture 2-1절 운영 적용 현황)
- 2026-09-25 주문 생성 제한 초기값을 공용 IP 환경을 고려해 5건/분에서 100건/분으로 상향(F-47, T-51, DECISIONS #44)
- 2026-09-25 노션 스프린트 보드: 담당자별 파트 진행 속성(진행중 담당·완료 담당·파트 진행)·"내 파트" 보기 추가, 진행 카드 44개 본문 최신화(담당·일정·마이그레이션 번호·호스팅) — Tasks 변경 이력
- 2026-09-25 DECISIONS #35(Vercel Hobby) 폐기 표시, #43 Cloudflare Workers 호스팅 추가 — T-50 결과가 결정 로그에만 누락돼 있던 것 정정
- 2026-09-25 FE2(관리자 화면) 김 혁(DB2 겸임) 이관 — Tasks 역할 약어·09-26 이후 일정 표 재배치(DECISIONS #42)
- 2026-09-25 마이그레이션 번호 배정 표·규칙 추가(Architecture 2-1절, DECISIONS #41) — 0002·0004~0006 결번, 신규 0010부터. README·supabase/migrations/README 갱신
- 2026-09-24 BE1 일정 조율 — T-07을 09-26으로, T-16 API를 BE2로 이관(Tasks)
- 2026-09-24 AppError 형식 `AppError(code, httpStatus, details?)`로 통일(CodingRules, PR #31, DECISIONS #40)
- 2026-09-24 P3 착수 기준 시각을 10-03 18시 → 10-04 18시로 변경(PRD 성공 기준·README·Tasks 배정 표)
- 2026-09-24 결제수단을 현금·계좌이체 두 가지로 축소(PRD Open Question #40, DECISIONS #39):
  - 간편결제(카카오페이·토스 개인 송금) 제외, "송금 하위 수단" 개념 삭제
  - PRD F-06·F-15·F-19·F-21·F-29(CSV 10컬럼)·F-42(계좌이체 안내)·F-44·F-48(계좌 설정 3개) 갱신
  - Architecture·ADR-0002·ADR-0004(설정 키 6개)·DECISIONS #14(폐기)·#20(CSV 13컬럼)·README·P1-QA-Scenario 갱신
  - Tasks: T-53 신설(간편결제 제외 스키마 마이그레이션, DB1), T-07 선행에 T-53 추가

### Added
- 2026-10-04 T-41 DB1 후기 저장 API `POST /api/orders/{token}/reviews`: 완료 주문 토큰 검증, 별점 1~5·선택 텍스트 200자, 중복·상태 변경 경합 거부. PR #102의 후기 테이블 사용, 신규 마이그레이션 없음. 고객 폼 연결·관리자 목록은 별도 담당 범위 — `docs/T-41-review-api.md`
- 2026-10-01 Cloudflare Workers 배포 설정 — `wrangler.jsonc`·`open-next.config.ts`·`npm run build:worker`(`@opennextjs/cloudflare` 1.20.7·wrangler 4.145.0 고정), CI에 Worker 번들 생성 검증, `GET /api/health`, 운영 가이드 `T-25-deployment.md` — PR #50(T-25, 유은조 작성·팀장 인수)
- 2026-10-01 관리자 주문 상태 변경 버튼(입금 확인·현금 수령 확인·조리 시작·조리 완료, 불허 전환 비활성·실패 알림) — PR #54(T-16 UI, 김 혁 작성·팀장 인수 — 통합 테스트 `requireAdmin` mock 제거, DECISIONS #46). 공통 전환 API는 PR #60(09-30)
- 2026-10-01 RLS 검증 통합 테스트(anon·관리자 API 클라이언트로 관리자 테이블 접근 확인) — PR #43(T-13 DB1, 서동혁)
- 2026-10-01 현장 운영 폴백 매뉴얼 `T-30-operations-runbook.md`(현금 수기 주문·QR 점검·장애 연락) — PR #63(T-30, 이주노)
- 2026-10-01 고객 주문 화면 — 메뉴판(검색)·옵션·장바구니·결제(P1은 현금만, 계좌이체 "준비 중")·주문 완료/현황(`/orders/{token}?new=1`)·개인정보 고지. PR #78(T-05·06·09·10·11·12, 팀장 인수 진행). 피그마 대비 변경 기록 `Design-Changes.md` 신규(DECISIONS #49)
- 2026-10-01 관리자 주문 대시보드를 인증된 `/admin`에 연결(실시간 목록·미확인 강조·픽업 번호 검색·확인 처리, `AdminShell`) — PR #51(T-15, 김 혁 작성·팀장 인수 마무리). `lucide-react` 1.48.0 추가
- 2026-10-01 고객 메뉴 API `GET /api/menu`(번역 폴백·품절·대기 수, `Cache-Control: no-store`) — PR #77(T-05, 팀장 인수 진행)
- 2026-10-01 주문 상태·대기 수 API `GET /api/orders/{token}`·`GET /api/queue`, 마이그레이션 0017 `count_waiting_before` — PR #61(T-11, 유은조 작성·팀장 리뷰 반영)
- 2026-10-01 관리자 로그인·라우트 보호(`src/proxy.ts`, 로그아웃은 이 기기 세션만) — PR #48(T-13 BE2, 유은조 작성·팀장 리뷰 반영, DECISIONS #48)
- 2026-09-22 팀장 의사결정 반영:
  - Open Question #38: 팀원 전원 Docker Desktop 설치 불가 판정에 따른 GitHub Actions CI 기반 통합 테스트 검증 체계 확정
  - Open Question #39: 주문 속도 제한(5건/분) 상수로 분리 정의
  - Open Question #35: Vercel 호스팅 배포 진행 확정
- 2026-09-22 문서 체계 실무 정돈:
  - CodingRules.md 규칙 테이블 작성 (네이밍, 린터, 에러 규격, 로깅, 테스트 기준 등)
  - GitWorkflow.md, DefinitionOfDone.md, Tasks.md, Architecture.md 내 레거시 하네스 참조 정리
- 2026-09-22 요구사항 및 설계 승인:
  - PRD (요구사항 F-01~F-48, 비기능 N-01~N-17), Architecture, DECISIONS (38건), ADR (0001~0009)
  - 작업 목록 (Tasks T-01~T-52) 및 팀 역할 분담 (FE1/FE2/BE1/BE2/DB1/DB2/팀장) 확정
- 2026-09-22 프로젝트 초기화 및 디렉터리 골격 구성
