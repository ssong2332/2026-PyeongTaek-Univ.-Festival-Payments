# tests/e2e — Playwright. `npm run test:e2e` (dev 서버는 playwright.config.ts의 webServer가 띄운다). 프로젝트: customer-android(Pixel 7) · customer-ios(iPhone 14) · admin-desktop (전부 chromium).

## 실행 조건 (T-24, ADR-0007)

E2E는 **로컬 Supabase에서만** 실행한다. CI에는 포함하지 않는다(DECISIONS #34).

1. Docker를 켜고 `supabase start` → 새 마이그레이션을 받았으면 `supabase db reset --local`
2. `.env.test.local`에 로컬 값(`SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`)을 둔다 — 통합 테스트와 같은 파일(`.env.test.example` 참고)
3. `npm run test:e2e`

`playwright.config.ts`가 시작할 때 주소를 확인한다(`support/localSupabase.ts`). `SUPABASE_URL`(개발 서버에는 `NEXT_PUBLIC_SUPABASE_URL`로 넘김)이나 셸의 `NEXT_PUBLIC_SUPABASE_URL`이 127.0.0.1·localhost가 아니면 개발 서버를 띄우기 전에 중단한다. 개발 서버에는 로컬 값을 환경변수로 넘겨 `.env.local`(운영 DB) 값을 덮어쓴다.

## 시나리오

- `smoke.spec.ts` — 첫 화면 응답·문서 언어
- `t24-transfer-order.spec.ts` — 메뉴 담기 → 계좌이체 주문 → 송금 안내 → [송금했어요] → 관리자 로그인 → 대시보드 "송금 신고됨" → 입금 확인. 고객은 모바일 프로젝트 2개에서 실행하고(admin-desktop에서는 건너뜀), 관리자 화면은 같은 테스트 안에서 데스크톱 창을 따로 연다.

준비 데이터는 `support/transferOrderFixture.ts`가 테스트마다 만들고 지운다: 전용 메뉴 1개, 계좌 설정(`transfer.*`), 관리자 계정(로컬 Auth Admin API — 비밀번호는 실행마다 새로 만들고 저장하지 않는다). 끝나면 만든 주문·메뉴·계정을 지우고 계좌 설정·픽업 번호 카운터·속도 제한 기록을 실행 전 값으로 되돌린다. seed 적용 여부와 무관하게 동작한다.
