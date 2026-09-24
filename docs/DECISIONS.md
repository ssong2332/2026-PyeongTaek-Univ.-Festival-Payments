# DECISIONS — 평택대 축제 부스 QR 주문·결제 시스템

> 소유자: 팀장 | 결정 한 줄 로그. 배경·대안 비교가 필요한 결정은 adr/에 별도 기록하고 여기서 링크한다.

## 결정 로그

| # | 날짜 | 결정 | 이유 (한 줄) | ADR |
|---|---|---|---|---|
| 1 | 2026-09-22 | 모든 고객·관리자 읽기/쓰기는 Next.js Route Handler(`/api/*`, service_role)를 경유. 고객 브라우저는 supabase-js 미사용, 관리자 브라우저는 Auth 세션 + Realtime 읽기 구독만 | 검증·인가·상태 머신을 한 계층에 모아 6명 병렬 구현 시 규칙 분산 방지, anon 노출 표면 0 | [ADR-0001](adr/0001-data-access-path.md) |
| 2 | 2026-09-22 | 주문 생성·상태 전환·시간 스윕은 Postgres 함수(`create_order`, `transition_order`, `sweep_order_timeouts`)로 구현하고 RPC 호출 | 원자성·행 잠금·UNIQUE로 N-01·N-02·F-09 보장 | [ADR-0002](adr/0002-order-creation-transaction.md) |
| 3 | 2026-09-22 | 재고 차감은 `UPDATE menu_items SET stock = stock - qty WHERE id = ? AND stock >= qty` + `CHECK (stock >= 0)` | 동시 주문 2건 중 1건만 통과, 음수 불가(N-02) | ADR-0002 |
| 4 | 2026-09-22 | 픽업 번호는 `counters` 테이블 행(`key='pickup_number'`)을 트랜잭션 내 `UPDATE … RETURNING`으로 증가 — 시퀀스 미사용 | 롤백 시 번호도 롤백되어 빈 번호 없음, 날짜 리셋 없음(F-09) | ADR-0002 |
| 5 | 2026-09-22 | 상태 페이지 토큰 = `gen_random_bytes(32)` hex 64자(256비트), `orders.status_token UNIQUE`, URL `/orders/{token}` | F-10 추측 불가(128비트 이상 권장값의 2배) | — |
| 6 | 2026-09-22 | 상태 enum(DB·TS 공통 영문): `pending`(결제대기)·`paid`(결제확인)·`cooking`(조리중)·`completed`(완료)·`cancelled`(취소)·`refunded`(환불)·`expired`(만료). 한글 라벨은 `messages/*.json` | 코드·DB 식별자는 영문, 표시만 번역 | — |
| 7 | 2026-09-22 | 현금 [현금 수령 확인]은 `pending → cooking` 직접 전환 1건(action `confirm_cash`)으로 표현 — `paid` 상태를 거치지 않음. 이력 1행 | F-16 "1회 클릭으로 조리중", 이력에 조리중 진입 기록이면 충분 | — |
| 8 | 2026-09-22 | 허용 전환 표의 단일 원본은 `src/domain/order/stateMachine.ts`. DB 함수는 CAS(현재 상태=기대 상태)·터미널 상태(completed/cancelled/refunded/expired) 불변·재고 복구·이력 기록만 강제 | 정책은 TS 한 곳, 무결성은 DB — 이중 정의 방지 | ADR-0002 |
| 9 | 2026-09-22 | 취소·환불·만료 전환 시 재고 복구는 `transition_order` 안에서 `order_items`를 메뉴별 합산해 `stock + qty` | 복구량 = 차감량(F-18 AC) | ADR-0002 |
| 10 | 2026-09-22 | 고객 취소 요청 거절 후 재요청 불가(버튼 비활성 유지, `cancel_rejected_at` 기록). 거절은 상태 불변 이력 행(`action='cancel_request_reject'`, from=to) | F-45는 최초 시각 유지만 요구 — 재요청 루프를 만들지 않음(추가 요구 없음) | — |
| 11 | 2026-09-22 | 관리자 대시보드는 Supabase Realtime(`orders` postgres_changes) + 끊김 시 5초 폴링 폴백 + 복구 시 전체 재조회 | N-07 지명 + F-31 재동기화 경로 재사용 | [ADR-0003](adr/0003-admin-realtime.md) |
| 12 | 2026-09-22 | 고객 상태 페이지는 Realtime 미사용, `GET /api/orders/{token}` 5초 폴링 | 익명 Realtime 연결 0으로 무료 티어 한도를 관리자 몫으로 확보 | ADR-0003 |
| 13 | 2026-09-22 | 설정값(만료 분·자동 완료·송금 정보)은 `app_settings(key,value)` 테이블. 환경변수는 인프라 시크릿만 | F-24 화면 변경 요구 + F-44 재배포 없는 반영 + N-05 | [ADR-0004](adr/0004-settings-storage.md) |
| 14 | 2026-09-22 | ~~카카오페이·토스 송금 URL은 `{amount}` 자리표시자 템플릿. 자리표시자 없으면 고객 화면이 자동 폴백(금액 크게 + 직접 입력 안내)~~ **2026-09-24 폐기** — 간편결제 제외(#39) | T-34 검증 결과를 코드가 아닌 데이터로 반영(F-42) | ADR-0004 |
| 15 | 2026-09-22 | UI 문자열은 `messages/{locale}.json` + 자체 `useT()`, 언어는 `?lang=` → 쿠키 `lang` → `ko`. 메뉴·옵션명은 엔티티별 번역 테이블 3개 | QR URL 라우팅 불변, 언어 추가 = 데이터만(N-08) | [ADR-0005](adr/0005-i18n.md) |
| 16 | 2026-09-22 | 시간 기반 전환은 `sweep_order_timeouts()` 멱등 함수 — pg_cron 1분 주기(가용 시) + 대시보드 30초 하트비트 `POST /api/admin/sweep` 폴백 | 서버리스에 상주 프로세스 없음, 무료 티어 pg_cron 가용성은 추정 | [ADR-0006](adr/0006-scheduled-transitions.md) |
| 17 | 2026-09-22 | 테스트: Vitest(단위·통합) + Playwright(E2E). 통합·E2E는 Supabase CLI 로컬 스택, 파일 직렬 실행 | 핵심 규칙이 DB 함수·RLS에 있어 실제 Postgres 필요, 격리·무료 | [ADR-0007](adr/0007-test-db-isolation.md) |
| 18 | 2026-09-22 | 전화번호(2차)는 Node AES-256-GCM, 키 `PHONE_ENCRYPTION_KEY`, 컬럼은 T-49 마이그레이션에서 추가(1차 스키마에 없음). 복호화는 `GET /api/admin/orders/{id}/phone` 한 곳 | N-17 앱 계층 지명, 1차 고지문 "수집 없음"을 스키마로 증명 | [ADR-0008](adr/0008-phone-encryption.md) |
| 19 | 2026-09-22 | 매출(F-28) = Σ `total_amount` of status ∈ {paid, cooking, completed}. 주문 건수 = count of status ∈ {paid, cooking, completed, refunded}. 환불 금액 = Σ of refunded(별도 표시). "오늘" = KST 달력일 | F-28 예시(30,000 − 5,000 = 25,000·3건)와 일치하는 유일한 해석 | — |
| 20 | 2026-09-22 | CSV(F-29)는 **항목당 1행**. 헤더 13개 = PRD 10개 + `주문 합계`·`결제확인 시각`·`완료 시각` (2026-09-24 `송금 하위 수단` 삭제로 14→13). UTF-8 BOM. CSV 매출 = 상태 ∈ {결제확인, 조리중, 완료} 행의 `금액` 합 = F-28 | 옵션·수량이 항목별이라 병합하면 합계 검증이 불가 | — |
| 21 | 2026-09-22 | 주문 항목은 메뉴명(ko/en)·단가·옵션명·추가 가격을 스냅샷 저장(`order_items`, `order_item_options`) | F-27 "기존 주문 금액 불변", 메뉴 수정·삭제 후에도 CSV 재현 | — |
| 22 | 2026-09-22 | 메뉴 삭제(2차 F-46)는 물리 삭제 없이 `menu_items.is_active=false`. `order_items.menu_item_id`는 `ON DELETE RESTRICT` | 주문 이력·통계 유지 | — |
| 23 | 2026-09-22 | 장바구니·멱등키는 브라우저 `sessionStorage`(zustand `persist`). 멱등키는 결제수단 화면 진입 시 생성, 주문 성공 시 장바구니와 함께 폐기 | F-08 새로고침 재전송·F-13 장바구니 유지 | — |
| 24 | 2026-09-22 | 네트워크 재시도(F-13): 타임아웃 8초, 네트워크 오류·타임아웃·5xx에 한해 자동 2회(1초·2초 백오프), 4xx는 재시도 없음. 이후 수동 버튼 | 멱등키가 있어 재시도가 안전, 4xx는 재시도해도 결과 동일 | — |
| 25 | 2026-09-22 | 입력 검증은 zod 스키마를 `src/lib/dto/*.ts`에 두고 클라이언트·서버가 공유. 에러 응답은 `{ error: { code, message, details? } }` 단일 봉투 | 프론트·백이 같은 타입을 import — 규격 드리프트 방지 | — |
| 26 | 2026-09-22 | 관리자 인가 = "Supabase Auth 세션이 있으면 관리자". 역할 테이블 없음. Supabase 대시보드에서 **회원가입 비활성화 필수**(T-25) | 계정 2~3개 수동 생성(F-20) — 역할 구분 요구 없음. 회원가입이 열리면 누구나 관리자가 되므로 반드시 차단 | ADR-0001 |
| 27 | 2026-09-22 | 타임스탬프는 DB `timestamptz`(UTC), 표시는 KST(`Asia/Seoul`) — `src/lib/format.ts` 한 곳 | 통계 "오늘"·CSV 시각의 일관성 | — |
| 28 | 2026-09-22 | 패키지 매니저 npm, Node 20 LTS, Next.js 최신 안정(App Router), Tailwind CSS, zod, zustand, recharts(F-30), Vitest, Playwright, Supabase CLI. 정확한 버전은 T-01에서 `create-next-app` 기본값으로 고정하고 lock 파일 커밋 | 최소 의존성 — 6명이 같은 lock으로 작업 | — |
| 29 | 2026-09-22 | 로깅은 `src/lib/logger.ts`(JSON 1줄, stdout, 필드 화이트리스트 + `phone*` 리댁션). 에러 추적 서비스 없음 | MVP·비용 0, N-17 로그 평문 0건 | — |
| 30 | 2026-09-22 | 데이터 파기(N-15)는 `supabase/scripts/purge_2026-11-08.sql`(orders 계열 TRUNCATE CASCADE + counters 리셋 + 검증 SELECT)을 관리자가 Supabase SQL Editor에서 수동 실행. 절차는 T-30 | 1회성 작업에 스케줄 잡은 과함, 검증 쿼리가 산출물 | — |
| 31 | 2026-09-22 | 대시보드 미확인(F-21) = `acknowledged_at IS NULL AND status ∈ {pending, paid, cooking}`. `POST /api/admin/orders/{id}/acknowledge`로 해제 | 활성 주문만 강조, 만료·취소는 자동 소거 | — |
| 32 | 2026-09-22 | 대기 수(F-11): 상태 페이지 = `count(status ∈ {pending,paid,cooking} AND created_at < 내 created_at)`, 메뉴판 = `count(status ∈ {pending,paid,cooking})` | PRD F-11 정의 그대로 | — |
| 33 | 2026-09-22 | 2차 기능(F-32~F-41, F-46)의 스키마 변경은 1차 마이그레이션에 넣지 않고 Architecture.md "2차 예정 스키마" 표에 예약만 한다 | 1차 DB를 최소로, 세부 미정(#25~#33) 확정 전 구조 고정 금지 | — |
| 34 | 2026-09-22 | (A) CI = GitHub Actions `.github/workflows/ci.yml` — push·PR마다 `unit-build` 잡(lint·unit·build, T-01), `integration` 잡(`supabase start` + 통합 테스트, T-02 추가). E2E는 CI 미포함. `main` 보호는 PR + 필수 체크 | 사용자 승인(원문 "전부 추천대로, 승인", PRD Open Question #34). 검증 루프 규칙 "CI를 쓰는 프로젝트면 워크플로 생성도 T-01" | — |
| 35 | 2026-09-22 | (B) 호스팅은 Vercel Hobby로 설계하되 **T-50 약관 확인 전 미확정** — Hobby 상업적 이용 제한(추정)에 해당하면 Vercel Pro 1개월(설계 영향 없음) 또는 Cloudflare Pages 무료(어댑터·IP 헤더·도메인 변경 → 팀장 확인) | 사용자 승인(PRD Open Question #35, N-14 예외). 전환 여부는 사실 확인 사항이라 지금 결정하지 않는다 | — |
| 36 | 2026-09-22 | (C) `POST /api/orders` 속도 제한 = IP당 분당 5건, 초과 429 `RATE_LIMITED`. 카운터는 Postgres `rate_limits` 테이블 + `consume_rate_limit` 함수(고정 윈도), 키는 IP sha256, 멱등 재요청은 제한 전에 반환, 한도는 `domain/order/rateLimit.ts` 상수 한 곳. `purge_2026-11-08.sql`에 `rate_limits` TRUNCATE 포함 | 사용자 승인(F-47, PRD Open Question #36). 서버리스 인메모리는 인스턴스별로 세어 무의미 — 대안 비교는 ADR | [ADR-0009](adr/0009-order-rate-limit.md) |
| 37 | 2026-09-22 | (D) 송금 정보·자동 완료·자동 만료 편집 UI는 대시보드 `SettingsPanel`(ADR-0004 키 8개 전부, `useSettings` 훅, 클라이언트도 `lib/dto/settings.ts` zod 공유). `PUT /api/admin/settings`는 부분 갱신, 규격 변경 없음. Table Editor 직접 편집은 폴백으로 유지 | 사용자 승인(F-48, PRD Open Question #37). ADR-0004의 "(1) 설정 패널 또는 (2) Table Editor" 중 (1)을 주 경로로 확정 | ADR-0004 |
| 38 | 2026-09-22 | (E) 통합·E2E 테스트 실행 지침(운영 지침, 요구사항 아님): Docker 가능 팀원은 전원 로컬 Supabase 스택으로 실행, 불가 팀원은 단위만 로컬 + 통합은 DB 담당·CI 잡에 위임. Docker 가능 범위는 미정(#38, 팀장 확인) | 사용자 승인(PRD Open Question #38). ADR-0007 규격은 그대로 — 실행 주체만 정함 | ADR-0007 |
| 39 | 2026-09-24 | 결제수단은 **현금·계좌이체 두 가지**. 카카오페이·토스 개인 송금(간편결제) 제외, "송금 하위 수단" 개념 삭제 — `transfer_method` 컬럼·enum 삭제, `refund_channel`은 `cash`/`bank`, `transfer.*` 설정은 계좌 3개 키, CSV 13컬럼 | 사용자 결정(PRD Open Question #40). T-34 결과 카카오페이 금액 고정 불가·toss.me 종료 | ADR-0002, ADR-0004, T-53 |
| 40 | 2026-09-24 | 에러 클래스는 `AppError(code, httpStatus, details?)`로 통일(Architecture 우선). `message`는 생성자 인자가 아니고 응답 변환 시 `code`별 고정 영문 문구. `domain/`은 던지지 않고 반환값 유니온 | Architecture와 CodingRules 불일치 해소(PR #31). 2026-09-25 원격 브랜치 전수 확인 — 4인자 호출 0건 | —
| 41 | 2026-09-25 | 마이그레이션 번호는 Architecture 2-1절 표에 미리 배정(0010부터), 표에 없는 파일은 표 추가 후 생성, 병합 순서 = 번호 순서, 0002·0004~0006 결번 | 여러 브랜치가 "최대 번호 + 1"로 같은 번호를 만들 수 있고 CI(빈 DB)는 못 잡음 — 신우석(BE1) 제안 | —
| 42 | 2026-09-25 | FE2(관리자 화면)를 김 혁(DB2 겸임)에게 이관, 김희진은 FE1(고객 화면) 전담 | 프론트 1인 집중 해소(09-26~10-03 김희진 18칸 → 10칸) | —
