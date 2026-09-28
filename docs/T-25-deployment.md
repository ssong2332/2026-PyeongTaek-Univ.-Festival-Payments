# T-25 Cloudflare Workers 배포 및 운영 가이드

> 소유자: BE2 (유은조) | 상태: 진행 중 (① 배포 준비 완료 / ② 10-04 최종 점검 대기) | 최종 갱신: 2026-09-28  
> 기준: PRD N-14, N-11, F-20 / Architecture 배포 절 (451~458라인) / DECISIONS #43

---

## 1. 배포 아키텍처 개요

- **호스팅 및 인프라**: **Cloudflare Workers Free + Supabase Free** (비용 0원 원칙 준수)
- **프로덕션 배포 브랜치**: **`dev`**
  - 작업 단위 브랜치(`feat/*`)가 `dev`에 PR 병합되면 자동으로 Cloudflare Workers 프로덕션에 배포됩니다.
  - Vercel에서 Cloudflare Workers로 전환되었으나, `dev`를 배포 기준으로 삼는 방침은 유지됩니다.
- **공식 운영 URL 및 QR 인쇄용 도메인**:
  ```text
  https://ptu-festival-payments.workers.dev
  ```
  > [!IMPORTANT]
  > Worker 이름(`ptu-festival-payments`)과 서브도메인은 확정되었으며, **축제 포스터 및 QR 인쇄물 출력 이후에는 절대 변경하지 않습니다 (N-11, N-14)**.

- **작업 단계 분할**:
  1. **① 배포 준비 (09-25, 현재 단계)**: `vinext` 호환성 검증, `wrangler.jsonc` 및 빌드 스크립트 정합성 구성, `GET /api/health` 구현, 운영 가이드 및 스모크 절차 수립.
  2. **② 최종 점검 (10-04, 선행 T-24 E2E 완료 후)**: 실제 Cloudflare 대시보드 Git 연동 배포 트리거, 실기기 스모크 테스트 5단계 수행, 접속 확인 증거 기록, 축제 전 `counters` 초기화.

---

## 2. Next.js 16 빌드 도구체계: `vinext` & `OpenNext`

Next.js 16(App Router)을 Cloudflare Workers 환경에 배포하기 위해 아래와 같이 역할을 분담합니다.

### 2.1. 정적 호환성 검사: `vinext check`
Cloudflare 공식 권장 정적 호환성 검사 도구인 `vinext check`(`npx vinext check`)를 수행하여 Next.js 16 App Router 및 의존 라이브러리의 호환성을 사전 검증하였습니다.

```text
vinext compatibility report
========================================

Imports: 4/4 fully supported
  ✓  next/navigation (3 files)
  ✓  next/server (4 files) — NextRequest/NextResponse shimmed
  ✓  server-only (2 files)
  ✓  next/headers (1 file)

Libraries: 2/2 compatible
  ✓  tailwindcss
  ✓  zod

Project structure:
  ✓  App Router (src/app/)
  ✓  3 page(s)
  ✓  2 layout(s)
  ✓  2 route handler(s)

Overall: 91% compatible (10 supported, 0 partial, 1 issues)
```
- **판정**: Next.js App Router 핵심 API 및 Route Handler, 라이브러리가 정상 호환됨을 확인.

### 2.2. 실제 Worker 산출물 생성: `@opennextjs/cloudflare`
Cloudflare Workers에서 Next.js를 서빙하기 위한 Worker 엔트리포인트 및 정적 에셋 번들 산출물은 OpenNext 어댑터를 통해 생성합니다.

- **Worker 번들 빌드 명령**:
  ```bash
  npm run build:worker
  # 내부 실행: opennextjs-cloudflare build
  ```
- **생성 산출물**:
  - Worker 스크립트: `.open-next/worker.js` (wrangler.jsonc의 `main` 필드와 일치)
  - 정적 에셋 디렉터리: `.open-next/assets` (wrangler.jsonc의 `assets.directory`와 일치)
- **로컬/수동 배포 명령**:
  ```bash
  npm run deploy
  # 내부 실행: opennextjs-cloudflare build && wrangler deploy
  ```

---

## 3. Cloudflare Workers 대시보드 설정 절차

1. **저장소 연결**:
   - Cloudflare 대시보드 → **Workers & Pages** → **Create application** → **Pages / Workers Git 연동** 선택
   - 저장소: `ssong2332/2026-PyeongTaek-Univ.-Festival-Payments`
2. **배포 브랜치 및 빌드 설정**:
   - **Production branch**: `dev`
   - **Build command**: `npx @opennextjs/cloudflare build` (또는 `npm run build:worker`)
   - **Build output directory**: `.open-next/assets`
   - **Worker Entrypoint**: `.open-next/worker.js`
3. **환경변수 및 Secrets 등록**:
   - **일반 환경변수 (Environment Variables)**:
     - `NEXT_PUBLIC_SUPABASE_URL`: 프로덕션 Supabase 프로젝트 URL (`https://<project-ref>.supabase.co`)
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 프로덕션 Supabase 익명 공개 키 (anon key)
   - **암호화 시크릿 (Encrypted Secrets - 절대 코드에 커밋 금지)**:
     - `SUPABASE_SERVICE_ROLE_KEY`: Supabase 서비스 롤 시크릿 키 (Server-side 전용)
     - `PHONE_ENCRYPTION_KEY`: (2차 배달 기능 착수 시) 전화번호 대칭 암호화 키

---

## 4. Supabase 프로덕션 프로젝트 배포 전 필수 체크리스트 (T-30 연계)

Cloudflare 배포 전, 운영 Supabase 인스턴스에서 아래 4가지 항목을 반드시 사전 완료해야 합니다.

1. **이메일 회원가입 차단 (최우선 보안 요구사항)**:
   - Supabase 대시보드 → **Authentication** → **Providers** → **Email**
   - **Allow new users to sign up** 스위치를 **OFF**로 변경 후 저장합니다.
   - *이유*: 누구나 가입할 수 있게 열려 있으면 관리자 API 및 주문 테이블을 누구나 조회할 수 있게 되므로 반드시 차단해야 합니다.
2. **관리자 계정 2~3개 수동 생성 (F-20)**:
   - **Authentication** → **Users** → **Add user** → **Create user**
   - 부스 운영진 이메일/비밀번호 등록 및 `Auto Confirm User = ON` 처리
3. **DB 마이그레이션 적용**:
   - `0001_schema.sql` ~ `0013_realtime.sql` 순서대로 프로덕션 DB에 적용 완료 확인
4. **초기 메뉴 및 설정 시드 데이터 (T-36)**:
   - `supabase/seed.sql`의 멱등 INSERT 쿼리를 SQL Editor에서 1회 실행

---

## 5. 배포 후 스모크 테스트 시나리오 (Architecture 457)

`dev` 브랜치 자동 배포 완료 후 프로덕션 URL(`https://ptu-festival-payments.workers.dev`)에서 아래 5단계를 수행합니다.

| 단계 | 수행 작업 | 기대 결과 | 구현/검증 위치 |
|---|---|---|---|
| 1 | `GET /api/health` 호출 | HTTP 200 및 `{"ok":true,"db":true,"time":"..."}` 반환 (DB 연결 정상) | `src/app/api/health/route.ts` (구현 완료, Vitest 통과) |
| 2 | 메인 고객 메뉴판 접속 (`/`) | 등록된 메뉴 목록 및 품절 상태, 대기인원 정상 표시 | 고객 메뉴판 페이지 |
| 3 | 현금 결제 테스트 주문 1건 생성 | 주문 완료 화면 진입 및 픽업 번호 발급 확인 | 주문 생성 API (`POST /api/orders`) |
| 4 | 관리자 로그인 및 대시보드 확인 | `/admin/login`에서 관리자 로그인 → 대시보드(`/admin`)에 테스트 주문 실시간 표시 확인 | 관리자 로그인 및 대시보드 |
| 5 | 테스트 주문 취소 및 정리 | 주문 상세에서 테스트 주문 취소 처리 → 축제 전 `counters` 초기화 | 주문 취소 API (`transition`) 및 counters reset |

---

## 6. 장애 대응 및 롤백 절차

1. **애플리케이션 롤백**:
   - Cloudflare Workers 대시보드의 **Deployments** 탭에서 직전 정상 동작 배포 버전의 **Rollback** 버튼을 클릭하여 30초 내 즉시 이전 상태로 복구합니다.
2. **데이터베이스 백업 및 복구**:
   - 축제 개막 전날(2026-10-06) 저녁, Supabase CLI로 스키마 및 설정 백업을 1회 수행합니다:
     ```bash
     supabase db dump -f backup_20261006.sql
     ```
   - 운영 DB는 롤백 마이그레이션 대신 항상 순방향 마이그레이션(Forward fix)으로 패치합니다.
