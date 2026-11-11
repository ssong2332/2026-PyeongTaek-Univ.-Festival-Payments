# T-25 Cloudflare Workers 배포 및 운영 가이드

> 소유자: BE2 (유은조) — 2026-10-01 팀장(박수홍) 인수 | 상태: 진행 중 (① 배포 준비 — **2026-10-01 운영 배포 완료**(7절) / ② 최종 점검 10-04 대기) | 최종 갱신: 2026-10-01  
> 기준: PRD N-14, N-11, F-20 / Architecture 배포 절 (451~458라인) / DECISIONS #43

---

## 1. 배포 아키텍처 개요

- **호스팅 및 인프라**: **Cloudflare Workers Free + Supabase Free** (비용 0원 원칙 준수)
- **프로덕션 배포 브랜치**: **`main`** (2026-10-01 `dev`에서 변경, DECISIONS #53)
  - 작업 단위 브랜치(`feat/*`)는 `dev`에 PR 병합(통합·CI). 운영 반영은 `dev` → `main` PR을 병합할 때 Cloudflare Workers가 `main`을 배포합니다.
  - Vercel에서 Cloudflare Workers로 전환하면서 `dev`를 배포 기준으로 삼았으나(2026-09-23), 2026-10-01 `main`으로 바꿨습니다(DECISIONS #53).
- **공식 운영 URL 및 QR 인쇄용 도메인** — 형식(Cloudflare 공식 문서):
  ```text
  https://ptu-festival-payments.<계정 workers.dev 서브도메인>.workers.dev
  ```
  - `<계정 workers.dev 서브도메인>`은 Cloudflare 대시보드 **Workers & Pages** 화면의 "Your subdomain" 값이다(계정마다 다름). 2026-10-01 정정: 이전 판의 `https://ptu-festival-payments.workers.dev`는 계정 서브도메인이 빠진 잘못된 주소다.
  - 실제 주소는 첫 배포 뒤 대시보드에 표시된 값으로 확정하고, 이 문서와 QR에 그대로 옮긴다.
  - **운영 주소(2026-10-06 확정)**: `https://ptu-festival-payments.aiisgod.workers.dev` — 팀장이 계정 서브도메인을 `asg21274` → `aiisgod`로 바꿈(DECISIONS #59, 대시보드 Workers & Pages → Your subdomain → Change). 확인: 변경 직후 옛 주소는 DNS에서 사라졌고(00:28 KST "DNS name does not exist"), 새 주소는 잠시 HTTPS 연결이 실패하다가(00:28~00:29, TLS handshake failure) 00:29:52 `/api/health` 200 `{"ok":true,"db":true}`, 00:30 `/`·`/admin/login`·`/api/menu?lang=ko` 200. 코드·환경변수는 고치지 않았다(운영 `main`은 572a346 그대로).
  - 2026-10-01 첫 배포 주소는 `https://ptu-festival-payments.asg21274.workers.dev`였다(7절 기록) — 더 이상 열리지 않으므로 인쇄물·즐겨찾기에 쓰지 않는다.
  > [!IMPORTANT]
  > Worker 이름(`ptu-festival-payments`)과 계정 서브도메인은 **축제 포스터 및 QR 인쇄물 출력 이후에는 절대 변경하지 않습니다 (N-11, N-14)**. 계정 서브도메인을 바꾸면 주소 전체가 바뀐다.

- **작업 단계 분할**:
  1. **① 배포 준비 (09-25 → 2026-10-01 완료)**: 배포 어댑터 확정(OpenNext, DECISIONS #52), `wrangler.jsonc` 및 빌드 스크립트 정합성 구성, `GET /api/health` 구현, 운영 가이드 및 스모크 절차 수립, Cloudflare Workers Builds 연결·첫 운영 배포·스모크(7절).
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
- **2026-10-01 재검사(팀장 인수)**: 현재 코드를 `vinext` 1.0.0으로 다시 검사한 결과 **100% compatible(13 supported, 0 partial, 0 issues)** — `src/proxy.ts`(Next.js 16)·라우트 핸들러 10개·페이지 8개·`lucide-react` 포함. 09-28의 "1 issue"는 당시 버전·코드 기준이라 지금은 재현되지 않는다.
- **배포 경로 선택: OpenNext (DECISIONS #52)**. 이유:
  | 항목 | vinext | OpenNext |
  |---|---|---|
  | 방식 | Next 빌드를 Vite로 대체("next CLI 대체") | `next build` 결과를 Worker로 변환 |
  | CI와의 관계 | CI가 검증하는 `next build`와 다른 산출물이 배포됨 | CI가 검증하는 빌드가 배포됨(CI가 Worker 번들 생성도 확인) |
  | 적용 범위 | `type: module`, vite 등 패키지 5개, `vite.config.ts`, 개발·빌드 명령 변경 | devDependencies 2개, `open-next.config.ts`, `wrangler.jsonc` |
  | 성숙도(npm) | 2026-02 첫 공개, 1.0.0은 2026-09-28 | 2024-09 첫 공개, 158개 버전, 1.20.7은 2026-09-29 |
  | 확인 | 정적 검사 100% | 실제 Worker 빌드 성공(2026-10-01 로컬 Windows, `.open-next/worker.js`·assets 생성, Node.js middleware 번들) |

### 2.2. 실제 Worker 산출물 생성: `@opennextjs/cloudflare`
Cloudflare Workers에서 Next.js를 서빙하기 위한 Worker 엔트리포인트 및 정적 에셋 번들 산출물은 OpenNext 어댑터를 통해 생성합니다.

- **도구 버전(2026-10-01 고정)**: `@opennextjs/cloudflare` 1.20.7, `wrangler` 4.145.0을 `devDependencies`에 정확한 버전으로 넣고 `package-lock.json`에 잠근다(이전 판의 버전 없는 `npx` 실행은 빌드할 때마다 최신을 받아 재현되지 않았다). OpenNext 1.20.7은 `next >= 16.3.6`(현재 16.3.8)과 `wrangler ^4.125.0`을 요구한다.
- **Node 버전**: wrangler 4.125 이상은 Node ≥ 22를 요구하므로 프로젝트를 Node 22(`.nvmrc` 22.23.3)로 바꿨다(DECISIONS #51). 앱 실행은 Cloudflare 런타임(`nodejs_compat`)이라 Node 버전은 빌드·개발·CI에만 영향.
- **CI 검증**: `.github/workflows/ci.yml` unit-build 잡이 `npm run build:worker` 후 `.open-next/worker.js`·`.open-next/assets` 생성을 확인한다.
- **Worker 번들 빌드 명령**:
  ```bash
  npm run build:worker
  # 내부 실행: opennextjs-cloudflare build
  ```
- **생성 산출물**:
  - Worker 스크립트: `.open-next/worker.js` (wrangler.jsonc의 `main` 필드와 일치)
  - 정적 에셋 디렉터리: `.open-next/assets` (wrangler.jsonc의 `assets.directory`와 일치)
- **로컬/수동 배포 명령**(평소에는 쓰지 않음 — 배포는 Cloudflare의 Git 연동이 `main` 기준으로 한다):
  ```bash
  npm run deploy
  # 내부 실행: opennextjs-cloudflare build && opennextjs-cloudflare deploy
  ```

---

## 3. Cloudflare Workers 대시보드 설정 절차

1. **저장소 연결 (Workers Builds — Pages가 아님)**:
   - Cloudflare 대시보드 → **Workers & Pages** → **Create** → **Workers** → **Import a repository**(Git 연동)
   - 저장소: `ssong2332/2026-PyeongTaek-Univ.-Festival-Payments`, Worker 이름은 `wrangler.jsonc`의 `name`(`ptu-festival-payments`)과 같게
2. **배포 브랜치 및 빌드 설정**:
   - **Production branch**: `main`
   - **비프로덕션 브랜치 빌드**(`dev`·작업 브랜치의 미리보기): 켜면 운영과 같은 변수·Secret으로 같은 운영 Supabase를 쓴다 — 미리보기 주소에서 주문을 만들지 않는다(픽업 번호가 축제 전체에서 이어짐). 필요 없으면 끈다 — **2026-10-01 끔**(생성 화면의 "Enable Preview builds")
   - **Build command**: `npm run build:worker`
   - **Deploy command**: `npx opennextjs-cloudflare deploy` (devDependency에 잠긴 1.20.7을 씀)
   - Worker 엔트리(`.open-next/worker.js`)와 정적 파일(`.open-next/assets`)은 `wrangler.jsonc`가 지정하므로 화면에 따로 넣지 않는다(이전 판의 "Build output directory"는 Pages용 항목).
   - Node 버전은 저장소의 `.nvmrc`(22.23.3)를 따른다 — 첫 빌드 로그에서 Node 버전이 22인지 확인한다.
3. **환경변수 및 Secrets 등록** — Cloudflare에는 **빌드 변수**(Settings → Build → Variables and secrets, 빌드할 때만)와 **실행 변수·Secret**(Settings → Runtime variables and secrets, Worker가 요청을 처리할 때)이 따로 있다:

   | 이름 | 빌드 변수 | 실행 변수 | 이유 |
   |---|---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | **등록** | 넣지 않음 | `NEXT_PUBLIC_` 값은 `next build` 때 서버·브라우저 코드 양쪽에 그대로 박힌다(Next 문서 `environment-variables.md` — "replace all references … in the Node.js environment", 코드는 모두 `process.env.NEXT_PUBLIC_…`로 직접 읽음). 빌드 변수에 없으면 관리자 로그인 화면이 500이 된다(2026-10-01 첫 배포에서 확인) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **등록** | 넣지 않음 | 위와 같음. 공개 키 — 예전 형식 anon 키 또는 새 형식 publishable 키(`sb_publishable_…`). 서버 비밀 키를 넣으면 앱이 일부러 오류를 낸다(`src/infra/supabase/config.ts`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | 넣지 않음 | **Secret**으로 등록(Type: Secret) | 서버 전용 비밀 키 — 예전 형식 service_role 키 또는 새 형식 secret 키(`sb_secret_…`). 빌드 로그·브라우저 코드에 들어가면 안 된다. 코드·문서·채팅에 값을 적지 않는다 |
   | `PHONE_ENCRYPTION_KEY` | — | (2차 배달 기능 착수 시) Secret | 전화번호 대칭 암호화 키 |

   > [!WARNING]
   > 실행 변수를 **일반 텍스트(Variable)**로 넣으면 다음 배포 때 지워진다. 배포 명령(`opennextjs-cloudflare deploy` → `wrangler deploy`)은 대시보드의 일반 실행 변수를 `wrangler.jsonc`의 `vars`(비어 있음)로 덮어쓴다(Cloudflare Wrangler 설정 문서: "Wrangler will override them the next time you deploy", `keep_vars` 미설정). **Secret은 지워지지 않는다.** 그래서 비밀 값은 반드시 Secret으로 넣고, `NEXT_PUBLIC_*`는 빌드 변수에만 넣는다.

   > [!NOTE]
   > 빌드 변수를 넣거나 바꾼 뒤에는 **다시 빌드**해야 반영된다(Deployments → 빌드 → Retry build). 실행 Secret만 바꾸면 Cloudflare가 기존 코드에 새 Secret을 붙인 버전을 바로 배포한다.

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
3. **DB 마이그레이션 적용** — 2026-10-01 현재 `0001`·`0003`·`0007`~`0013`·`0016`·`0017` 적용 완료(Architecture 2-1절 운영 적용 현황). `0018`·`0019`는 PR 병합 뒤 DB1이 적용.
4. **초기 메뉴 및 설정 시드 데이터 (T-36)** — 2026-10-01 운영 적용 완료(메뉴 4·초기 재고 100×4·번역 8·설정 6, DECISIONS #50).

---

## 5. 배포 후 스모크 테스트 시나리오 (Architecture 457)

`dev` → `main` 병합으로 자동 배포가 끝난 뒤 운영 URL(`https://ptu-festival-payments.<계정 서브도메인>.workers.dev`, 2026-10-01 기준 1절 주소)에서 아래 5단계를 수행합니다. 2026-10-01 첫 배포 결과는 7절.

| 단계 | 수행 작업 | 기대 결과 | 구현/검증 위치 |
|---|---|---|---|
| 1 | `GET /api/health` 호출 | HTTP 200 및 `{"ok":true,"db":true,"time":"..."}` 반환 (DB 연결 정상) | `src/app/api/health/route.ts` (구현 완료, Vitest 통과) |
| 2 | 메인 고객 메뉴판 접속 (`/`) | 등록된 메뉴 목록 및 품절 상태, 대기인원 정상 표시 | 고객 메뉴판 페이지 |
| 3 | 현금 결제 테스트 주문 1건 생성 | 주문 완료 화면 진입 및 픽업 번호 발급 확인 | 주문 생성 API (`POST /api/orders`) |
| 4 | 관리자 로그인 및 대시보드 확인 | `/admin/login`에서 관리자 로그인 → 대시보드(`/admin`)에 테스트 주문 실시간 표시 확인 | 관리자 로그인 및 대시보드 |
| 5 | 테스트 주문 마무리 및 정리 | 관리자 대시보드에서 테스트 주문 "현금 수령 확인" → "조리 완료"(P1에는 취소 화면이 없음 — T-17은 P2). 축제 전 테스트 주문 삭제·`counters` 초기화·재고 원복은 별도 정리 절차(SQL Editor)로 한 번에 | 관리자 상태 변경(T-16) / 정리 절차는 축제 전 작성 |

---

## 6. 장애 대응 및 롤백 절차

1. **애플리케이션 롤백**:
   1. Cloudflare Dashboard → Workers & Pages로 이동한다.
   2. `ptu-festival-payments` Worker를 선택한다.
   3. Deployments 탭으로 이동한다.
   4. 직전 정상 동작 버전을 확인한다.
   5. 해당 버전 오른쪽 `...` 메뉴에서 Rollback을 실행한다.
   6. 롤백 후 운영 URL 접속을 확인한다.
   7. `GET /api/health`가 정상 응답하는지 확인한다.
   8. 고객 메뉴 접속 → 테스트 주문 → 관리자 수신까지 최소 스모크 테스트를 수행한다.
   9. DB 스키마 변경이 포함된 장애인 경우 앱 롤백만으로 복구 완료로 판단하지 않고 DB 담당자와 별도 확인한다.

   > Worker 롤백은 Supabase 운영 데이터나 DB 스키마를 이전 상태로 되돌리지 않는다.
   
2. **데이터베이스 백업 및 복구**:
   - 축제 개막 전날(2026-10-06) 저녁, Supabase CLI로 스키마 및 설정 백업을 1회 수행합니다:
     ```bash
     supabase db dump -f backup_20261006.sql
     ```
   - 운영 DB는 롤백 마이그레이션 대신 항상 순방향 마이그레이션(Forward fix)으로 패치합니다.

---

## 7. 운영 배포 기록 (2026-10-01, 팀장 박수홍 진행)

| 항목 | 값 | 근거 |
|---|---|---|
| 배포 커밋 | `main` `572a346` (릴리스 PR #84, `dev` `eabeed9`와 내용 같음 — #85 리뷰 수정 포함) | `git log origin/main` |
| Worker | `ptu-festival-payments` — Workers Builds 연결, Production branch `main`, 미리보기 빌드 끔 | Cloudflare Settings → Builds |
| 운영 URL | `https://ptu-festival-payments.asg21274.workers.dev`(첫 배포 당시) → 2026-10-06 `https://ptu-festival-payments.aiisgod.workers.dev`로 변경(1절) | 배포 로그 "Deployed … triggers" / 10-06 새 주소 `/api/health` 200 |
| 빌드 환경 | Node 22.23.3(`.nvmrc`), Next 16.3.8, `@opennextjs/cloudflare` 1.20.7, wrangler 4.145.0 | 빌드 로그 |
| 변수 | 빌드 변수 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`(publishable 키), 실행 Secret `SUPABASE_SERVICE_ROLE_KEY`(secret 키) — 값은 기록하지 않음 | Cloudflare Settings(이름·형식만 확인) |
| 활성 버전 | `ec3548d8` (변수 추가 뒤 Retry build로 만든 버전) | Deployments → Active deployment |
| `GET /api/health` | 200 `{"ok":true,"db":true}` (17:37 KST) | `curl` |
| 조회 확인 | `/`·`/cart`·`/privacy`·`/admin/login` 200, `/admin` → 307 `/admin/login`, `/api/menu` 메뉴 4개(재고 100), `/api/queue` `{"waitingCount":0}` | `curl`(주문 생성 없음) |
| 스모크(5절 1~5단계) | 통과(17:45 KST) — 고객 375px 현금 주문 픽업 002 → 주문 현황이 새로고침 없이 조리중·완료로 바뀜, 관리자 로그인·대시보드, 현금 수령 확인 → 조리 완료(이력 `actor_type=admin`) | 세션 "프로토타입 배포 준비" 보고 |
| 미확인 | 관리자 화면 모바일 | — |

**첫 배포에서 겪은 것** (다음 배포·재설정 때 참고):
1. 생성 화면에서 넣은 변수가 저장되지 않아 첫 빌드가 변수 없이 돌았다 → `/api/health` 503·`/admin/login` 500. Settings에서 변수를 다시 넣고 Retry build로 해결.
2. `SUPABASE_SERVICE_ROLE_KEY`가 처음에 일반 Variable로 들어갔다 → 다음 배포 때 지워질 값이라 Secret으로 다시 넣음(3절 경고).
3. Claude 앱 내장 브라우저에서는 Cloudflare 로그인 사람 확인(Turnstile)이 통과되지 않았다 → 평소 쓰는 브라우저에서 진행.

**축제 전 정리 대상**(스모크 테스트 데이터): 주문 001·002와 이력, `counters.pickup_number` 2 → 0, 재고 기본호떡·뿌링클 99 → 100. 축제 직전에 한 번에 정리한다.
