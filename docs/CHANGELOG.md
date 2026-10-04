# Architecture — 평택대 축제 부스 QR 주문·결제 시스템

> 소유자: 팀장 | 상태: 승인 | 최종 수정: 2026-09-22
> 상태는 초안/승인 두 가지. "승인"으로 바꾸는 것은 팀장만 한다 — 승인 전 구현 착수 금지.

이 문서의 목적: 팀원 5~6명이 각자 AI 도구로 **합의 없이 병렬 구현해도 합쳐지도록** 스키마·API·상태 머신·폴더 구조를 못 박는다. 담당 팀원은 여기 정의된 규격만 사용한다 — 규격에 없는 것이 필요하면 구현하지 말고 architect에게 보고한다. 수치 중 "추정"으로 표시된 것은 구현 시 확인한다.

## 기술 스택

| 계층 | 선택 | 선택 이유 (DECISIONS/ADR 참조) |
|---|---|---|
| 언어 | TypeScript (strict) | PRD 배경: 팀 자바 하·프론트 중 → TS 풀스택 통일 |
| 프레임워크 | Next.js (App Router) + React + Tailwind CSS | PRD 확정 스택. Route Handler가 유일한 데이터 접근 경로 (ADR-0001) |
| 저장소 | Supabase — PostgreSQL(RLS, Postgres 함수), Auth(관리자 이메일+비밀번호), Realtime(관리자 대시보드) | PRD 확정 스택. 원자성은 Postgres 함수 (ADR-0002), 실시간 (ADR-0003) |
| 검증·상태 | zod(DTO 공유), zustand(장바구니, sessionStorage persist) | DECISIONS #23, #25 |
| 아이콘 | lucide-react 1.48.0(관리자 대시보드 아이콘, ISC 라이선스, 정확한 버전 고정) | PR #51(T-15, 2026-10-01) |
| 차트 | recharts | F-30 메뉴별 판매율 (DECISIONS #28) |
| 테스트 | Vitest(단위·통합), Playwright(E2E), Supabase CLI 로컬 스택 | ADR-0007 |
| 배포 | Cloudflare Workers Free + Supabase Free, `*.workers.dev` | N-14. 한도는 "배포" 절 |
| 패키지·런타임 | npm, Node 22 LTS(`.nvmrc` 22.23.3 — 2026-10-01 Node 20에서 변경) | DECISIONS #28, #51 |

## 구조 개요

```
/                                   # 리포지토리 루트
├─ .github/workflows/ci.yml         # GitHub Actions — "테스트 전략" CI 행 (T-01)
├─ src/
│  ├─ app/                          # Next.js App Router — 페이지·Route Handler만 (로직 없음)
│  │  ├─ (customer)/                # 고객 화면 (비로그인)
│  │  │  ├─ layout.tsx              #   언어 결정(쿠키/쿼리) + LanguageToggle + 고지 링크
│  │  │  ├─ page.tsx                #   /            메뉴판
│  │  │  ├─ cart/page.tsx           #   /cart        장바구니
│  │  │  ├─ checkout/page.tsx       #   /checkout    결제수단 선택 / 주문 확정
│  │  │  ├─ orders/[token]/page.tsx #   /orders/{t}  주문 완료 + 상태 페이지 (같은 화면)
│  │  │  └─ privacy/page.tsx        #   /privacy     개인정보 고지
│  │  ├─ admin/
│  │  │  ├─ login/page.tsx          #   /admin/login
│  │  │  └─ (protected)/            #   layout.tsx에서 세션 없으면 /admin/login 리다이렉트
│  │  │     ├─ layout.tsx
│  │  │     ├─ page.tsx             #   /admin        실시간 주문 대시보드 (+설정 패널)
│  │  │     ├─ menus/page.tsx       #   /admin/menus  메뉴·재고 관리
│  │  │     └─ stats/page.tsx       #   /admin/stats  통계 + CSV
│  │  └─ api/                       # Route Handlers — "데이터 모델과 인터페이스" 절의 표와 1:1
│  │     ├─ health/route.ts
│  │     ├─ menu/route.ts
│  │     ├─ queue/route.ts
│  │     ├─ settings/transfer/route.ts
│  │     ├─ orders/route.ts
│  │     ├─ orders/[token]/route.ts
│  │     ├─ orders/[token]/transfer-report/route.ts
│  │     ├─ orders/[token]/cancel-request/route.ts
│  │     └─ admin/
│  │        ├─ orders/route.ts
│  │        ├─ orders/[id]/route.ts
│  │        ├─ orders/[id]/acknowledge/route.ts
│  │        ├─ orders/[id]/transition/route.ts
│  │        ├─ orders/[id]/cancel-request/route.ts
│  │        ├─ menus/route.ts
│  │        ├─ menus/[id]/route.ts
│  │        ├─ option-groups/[id]/route.ts
│  │        ├─ options/[id]/route.ts
│  │        ├─ stats/route.ts
│  │        ├─ stats/csv/route.ts
│  │        ├─ settings/route.ts
│  │        └─ sweep/route.ts
│  ├─ domain/                       # 순수 TS — next/supabase import 금지. 단위 테스트의 주 대상
│  │  ├─ order/status.ts            #   OrderStatus 등 enum·타입
│  │  ├─ order/stateMachine.ts      #   허용 전환 표(단일 원본) + resolveTransition()
│  │  ├─ order/pricing.ts           #   장바구니 합계 계산(표시용 — 서버 값이 권위)
│  │  ├─ order/queue.ts             #   대기 수 규칙
│  │  ├─ order/rateLimit.ts         #   ORDER_CREATE_RATE_LIMIT 상수(한도 단일 원본, ADR-0009)
│  │  ├─ stats/aggregate.ts         #   매출·판매율 집계 규칙
│  │  ├─ stats/csv.ts               #   CSV 행 생성
│  │  └─ i18n/locales.ts            #   SUPPORTED_LOCALES, DEFAULT_LOCALE
│  ├─ services/                     # 유즈케이스 — ports(인터페이스)만 의존
│  │  ├─ ports.ts                   #   OrderRepository, MenuRepository, SettingsRepository, RateLimitRepository, Clock
│  │  ├─ orderService.ts            #   createOrder, getOrderByToken, reportTransfer, requestCancel
│  │  ├─ adminOrderService.ts       #   listOrders, transition, acknowledge, resolveCancelRequest
│  │  ├─ menuService.ts             #   getMenu(locale), updateMenu…
│  │  ├─ statsService.ts            #   getStats, buildCsv
│  │  └─ settingsService.ts         #   getTransferSettings, updateSettings
│  ├─ infra/
│  │  ├─ supabase/server.ts         #   서비스 클라이언트(service_role) — 서버 전용
│  │  ├─ supabase/session.ts        #   @supabase/ssr 쿠키 세션 클라이언트 + requireAdmin()
│  │  ├─ supabase/browser.ts        #   브라우저 클라이언트(관리자 Auth·Realtime 전용)
│  │  ├─ supabase/database.types.ts #   `supabase gen types`로 생성 (수정 금지)
│  │  ├─ repositories/*.ts          #   ports 구현체 — SQL/RPC는 여기만
│  │  └─ crypto/phoneCipher.ts      #   (2차, T-49)
│  ├─ lib/
│  │  ├─ dto/*.ts                   #   zod 스키마 + 추론 타입 (클라이언트·서버 공유)
│  │  ├─ api/errors.ts              #   AppError, ErrorCode, toErrorResponse
│  │  ├─ api/handler.ts             #   withHandler(): try/catch·로깅·봉투 변환
│  │  ├─ api/client.ts              #   fetchJson(), postOrderWithRetry()
│  │  ├─ api/clientIp.ts            #   getClientIp(request) — 프록시 헤더 판별 + sha256 키 (ADR-0009)
│  │  ├─ i18n/*.ts                  #   useT(), getLocale(), messages 로더
│  │  ├─ format.ts                  #   KST 시각·원화 포맷
│  │  └─ logger.ts
│  ├─ features/                     # 화면 상태 훅 (화면별 데이터·상태 소유자)
│  │  ├─ customer/useMenu.ts, useCart.ts(zustand), useOrderStatus.ts, useCheckout.ts
│  │  └─ admin/useOrdersFeed.ts, useConnectionMonitor.ts, useStats.ts, useMenuAdmin.ts, useSettings.ts
│  └─ components/
│     ├─ ui/                        #   버튼·입력·배지·토스트·스켈레톤 (디자인 담당)
│     ├─ customer/                  #   MenuCard, OptionSelector, QuantityStepper, CartSummary, PaymentMethodPicker, PickupNumberDisplay, TransferGuide, OrderStatusBadge, QueueCount, LanguageToggle
│     └─ admin/                     #   OrderCard, OrderActionButtons, ConnectionBanner, PickupSearch, SalesSummary, MenuEditForm, SettingsPanel, SalesChart
├─ messages/ko.json, en.json        # UI 문자열 사전
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                   # 0001_schema.sql, 0003_rls.sql, 0007~ — 번호는 Architecture "마이그레이션 번호 배정" 표만 따른다(0002·0004~0006 결번), 2차: 01xx_*
│  ├─ seed.sql                      # 설정 기본값 + counters + 메뉴·옵션 초기값(T-36)
│  └─ scripts/purge_2026-11-08.sql
├─ tests/
│  ├─ unit/                         # domain·services(ports mock)·components
│  ├─ integration/                  # 로컬 Supabase 대상: RPC·RLS·Route Handler
│  └─ e2e/                          # Playwright
├─ .env.example
└─ docs/
```

## 모듈 경계와 책임

| 모듈 | 책임 (한 줄) | 의존 대상 | 주 담당(역할) · 관련 Task |
|---|---|---|---|
| `supabase/migrations` | 스키마·제약·Postgres 함수·RLS·publication — DB의 단일 원본 | 없음 | DB · T-03, T-13(RLS), T-07/T-08(함수), T-18/T-19(스윕), T-51(속도 제한) |
| `.github/workflows` | CI — push·PR마다 unit + build(T-01), integration(T-02 이후) | 없음 | 백엔드 · T-01, T-02 |
| `supabase/seed.sql` | 설정 기본값·카운터·초기 메뉴(멱등) | migrations | DB · T-36 |
| `src/domain` | 프레임워크 무관 규칙: 상태 머신, 가격, 대기 수, 집계, CSV | 없음 | 백엔드 · T-14, T-06, T-11, T-21, T-22 |
| `src/services` | 유즈케이스 조합: 검증된 DTO → 포트 호출 → 도메인 규칙 → 결과. 예외 던짐 | domain, ports | 백엔드 · T-07~T-11, T-16~T-19, T-32, T-35, T-51 |
| `src/infra/repositories` | 포트 구현 — supabase-js 쿼리·RPC·DB 에러→AppError 변환. SQL은 여기만 | infra/supabase, domain 타입 | 백엔드/DB · 각 서비스 Task와 동일 |
| `src/infra/supabase` | 클라이언트 3종(서비스·세션·브라우저) + 생성 타입 + `requireAdmin()` | 환경변수 | 백엔드 · T-02, T-13 |
| `src/app/api` | HTTP 경계: zod 파싱 → 서비스 호출 → DTO 응답. 로직 없음 | services, lib/dto, lib/api | 백엔드 · 각 API Task |
| `src/lib/dto` | 요청·응답 zod 스키마 — 프론트·백 공용 계약 | zod | 백엔드가 먼저 작성, 프론트가 import · T-03 직후 |
| `src/features/customer` | 고객 화면 상태 소유(메뉴 로드·장바구니·주문 진행·상태 폴링) | lib/api/client, lib/dto, domain/order/pricing | 프론트 · T-05, T-06, T-09, T-10, T-11 |
| `src/features/admin` | 관리자 화면 상태 소유(피드 병합·연결 감시·통계·메뉴 편집·설정) | lib/api/client, infra/supabase/browser(Realtime) | 프론트/백엔드 · T-15, T-23, T-20, T-21 |
| `src/components/ui` | 시각 요소·접근성(스타일은 디자인 재량, 동작 계약은 이 문서) | Tailwind | 디자인 · T-05 이후 병렬 |
| `src/components/customer`, `components/admin` | 화면 조립 단위. props로만 데이터 수신, fetch 금지 | components/ui, lib/i18n | 프론트 + 디자인 |
| `src/app/(customer)`, `app/admin` | 라우트·레이아웃·인증 가드. features 훅을 컴포넌트에 연결 | features, components | 프론트 |
| `messages/*.json` | UI 문자열(ko 필수, en) | 없음 | 프론트 · T-04 |
| `tests/*` | 단위·통합·E2E | 전체 | 각 Task 담당 + T-01(하네스), T-24(E2E) |

병렬 분담 규칙: 한 Task는 위 표의 모듈 1~2개만 건드린다. `lib/dto`·`domain/order/status.ts`·`stateMachine.ts`·`migrations`는 **계약 모듈** — 변경이 필요하면 팀장 보고 후 갱신(임의 변경 금지).

## 데이터 흐름

### 고객 주문 생성 (F-06~F-09, F-13)

```
[checkout 페이지] useCheckout
  ├─ 진입 시 idempotencyKey = crypto.randomUUID() → sessionStorage
  ├─ 확정 클릭 → CreateOrderRequest(zod 검증) → postOrderWithRetry()  (8초 타임아웃, 자동 2회)
  ▼
POST /api/orders (Route Handler)
  ├─ CreateOrderRequestSchema.parse(body)      → 실패: 400 VALIDATION_ERROR
  ├─ clientKey = getClientIp(request) → sha256               (ADR-0009)
  ├─ orderService.createOrder(dto, clientKey)
  │    ├─ ① repo.findByIdempotencyKey(key) → 있으면 200 반환 (속도 제한 미소비 — F-47 멱등 예외)
  │    ├─ ② rateLimitRepo.consume('order_create', clientKey, ORDER_CREATE_RATE_LIMIT.limit, ORDER_CREATE_RATE_LIMIT.windowSeconds) → rpc('consume_rate_limit')
  │    │      false → 429 RATE_LIMITED + Retry-After (주문·재고·픽업 번호 미소비)
  │    └─ ③ orderRepository.createOrder() → supabase.rpc('create_order', …)
  │         └─ [Postgres 트랜잭션] 멱등키 조회 → 판매 가능·옵션 검증 → 가격 재계산 → 재고 차감(stock>=qty)
  │            → 픽업 번호(counters) → 토큰 → orders/items/options/history INSERT
  │         에러 매핑: OUT_OF_STOCK / MENU_UNAVAILABLE / INVALID_OPTION → 409
  ▼
201 (신규) / 200 (멱등 재요청) CreateOrderResponse {orderId, pickupNumber, statusToken, …}
  ▼
[클라이언트] 장바구니·멱등키 폐기 → router.replace(`/orders/${statusToken}?new=1`) — `new=1`이면 상태 페이지가 주문 완료 보기부터 보여 준다
```

### 관리자 상태 전환 (F-15, F-16, F-18, F-19, F-23)

```
[대시보드 OrderCard] 버튼(action) → POST /api/admin/orders/{id}/transition {action, reason?, refundChannel?}
  ├─ requireAdmin() (쿠키 세션 getUser)            → 실패: 401
  ├─ TransitionRequestSchema.parse
  ├─ adminOrderService.transition(id, action, actor)
  │    ├─ order = repo.findById(id)                  → 없음: 404
  │    ├─ {to, restoreStock, needsReason} = stateMachine.resolveTransition(order, action)  → 불허: 409 INVALID_TRANSITION
  │    ├─ reason 필수인데 빈값                        → 400 REASON_REQUIRED
  │    └─ repo.transition(id, from=order.status, to, action, actor, reason, refundChannel)
  │         → rpc('transition_order') [CAS: status = from 아니면 예외 STATE_CHANGED(409)]
  │           재고 복구(to ∈ cancelled/refunded/expired), 타임스탬프, history INSERT
  ▼
200 AdminOrderDto (갱신본)  +  Realtime UPDATE가 모든 대시보드에 전파  +  고객 상태 페이지는 다음 폴링(≤5초)에 반영
```

### 실시간 피드·연결 감시: ADR-0003. 시간 기반 스윕: ADR-0006.

## 데이터 모델과 인터페이스

### 1. 주문 상태 머신 (F-14, F-16~F-19, F-24, F-45)

상태(DB enum `order_status`, TS `OrderStatus`):

| 값 | 한글 라벨 | 의미 | 터미널 |
|---|---|---|---|
| `pending` | 결제대기 | 생성됨, 결제 미확인 | 아니오 |
| `paid` | 결제확인 | 송금 입금 확인됨 (현금은 거치지 않음) | 아니오 |
| `cooking` | 조리중 | 조리 시작 | 아니오 |
| `completed` | 완료 | 픽업 완료 | 예 |
| `cancelled` | 취소 | 관리자 취소(결제대기·결제확인에서) | 예 |
| `refunded` | 환불 | 관리자 환불(조리중에서) | 예 |
| `expired` | 만료 | 시스템 자동 만료 | 예 |

허용 전환 표 — **단일 원본은 `src/domain/order/stateMachine.ts`**. 여기 없는 전환은 전부 409 `INVALID_TRANSITION`.

| action | from → to | 주체 | 조건 | 사유 | 재고 복구 | 타임스탬프 |
|---|---|---|---|---|---|---|
| `confirm_payment` | pending → paid | admin | `payment_method = 'transfer'` | 없음 | 아니오 | `paid_at` |
| `confirm_cash` | pending → cooking | admin | `payment_method = 'cash'` | 없음 | 아니오 | `paid_at`, `cooking_started_at` (동시 기록) |
| `start_cooking` | paid → cooking | admin | — | 없음 | 아니오 | `cooking_started_at` |
| `complete` | cooking → completed | admin | — | 없음 | 아니오 | `completed_at` |
| `auto_complete` | cooking → completed | system | `auto_complete.enabled = true` AND `cooking_started_at + N분 <= now` | 없음 | 아니오 | `completed_at` |
| `cancel` | pending → cancelled, paid → cancelled | admin | — (고객 취소 요청 승인도 이 action) | **필수** | **예** | `closed_at` |
| `refund` | cooking → refunded | admin | `refund_channel` 필수 (`cash` / `bank` — 주문의 결제수단과 일치해야 함: 현금 주문은 `cash`, 계좌이체 주문은 `bank`. 2026-09-24 간편결제 제외) | **필수** | **예** | `closed_at`, `refund_channel` |
| `expire` | pending → expired | system | `transfer_reported_at IS NULL` AND `created_at + expire_minutes <= now` | 없음 | **예** | `closed_at` |

상태를 바꾸지 않는 이벤트(이력 행은 `from = to`로 기록):

| action | 대상 상태 | 주체 | 효과 |
|---|---|---|---|
| `create` | (없음) → pending | customer | 주문 생성 이력 |
| `acknowledge` | pending/paid/cooking | admin | `acknowledged_at`, `acknowledged_by` 설정 (F-21). 이력 없음 |
| `transfer_report` | pending AND transfer | customer | `transfer_reported_at` 최초 1회만 (F-43). 이력 없음 |
| `cancel_request` | pending/paid | customer | `cancel_requested_at` 최초 1회만, `cancel_rejected_at IS NULL`일 때만 (F-45). 이력 없음 |
| `cancel_request_reject` | pending/paid AND `cancel_requested_at IS NOT NULL` | admin | `cancel_rejected_at = now()`, 이력 행(사유 필수) (F-18) |

DB 함수 `transition_order`가 추가로 강제하는 무결성: (1) 현재 상태가 `p_from`과 같을 때만 갱신(CAS, 아니면 `STATE_CHANGED`), (2) `p_from`이 터미널이면 무조건 거부, (3) `p_to ∈ {cancelled, refunded, expired}`면 재고 복구, (4) 이력 1행 INSERT. 정책(어떤 pair가 허용인지)은 TS에만 있다 — DB 함수에 pair 표를 복제하지 않는다 (DECISIONS #8).

`resolveTransition(order, action, ctx)` 시그니처(도메인):

```ts
type TransitionResult =
  | { ok: true; to: OrderStatus; restoreStock: boolean; needsReason: boolean; needsRefundChannel: boolean }
  | { ok: false; code: 'INVALID_TRANSITION' | 'REASON_REQUIRED' | 'REFUND_CHANNEL_REQUIRED' };
function resolveTransition(order: { status: OrderStatus; paymentMethod: PaymentMethod },
                           action: TransitionAction,
                           input: { reason?: string; refundChannel?: RefundChannel }): TransitionResult;
function availableActions(order): TransitionAction[];   // 대시보드 버튼 활성/비활성의 근거
```

고객 화면 버튼 노출 규칙(`GET /api/orders/{token}` 응답의 파생 필드): `canTransferReport = status='pending' && paymentMethod='transfer' && transferReportedAt==null`, `canCancelRequest = status∈{pending,paid} && cancelRequestedAt==null && cancelRejectedAt==null`.

### 2. DB 스키마 (1차 — `supabase/migrations/0001_schema.sql`)

공통: PK는 `uuid DEFAULT gen_random_uuid()`, 시각은 `timestamptz` UTC, 금액은 `integer`(원, 소수 없음). 모든 테이블 `ENABLE ROW LEVEL SECURITY`.

| 테이블 | 컬럼 (타입, 제약) | 비고 |
|---|---|---|
| `menu_items` | `id` uuid PK · `base_price` int NOT NULL CHECK ≥0 · `stock` int NOT NULL DEFAULT 0 CHECK ≥0 · `is_sold_out_manual` bool NOT NULL DEFAULT false · `is_active` bool NOT NULL DEFAULT true · `sort_order` int NOT NULL DEFAULT 0 · `image_url` text NULL · `created_at`, `updated_at` timestamptz NOT NULL DEFAULT now() | 판매 가능 = `is_active AND NOT is_sold_out_manual AND stock > 0` (F-25·F-26). 이름은 번역 테이블 |
| `menu_item_translations` | `menu_item_id` uuid FK→menu_items ON DELETE CASCADE · `locale` text · `name` text NOT NULL CHECK length>0 · `description` text NULL · PK `(menu_item_id, locale)` | ko 행 필수(시드 테스트) |
| `option_groups` | `id` uuid PK · `menu_item_id` uuid FK CASCADE · `min_select` int NOT NULL DEFAULT 0 CHECK ≥0 · `max_select` int NOT NULL DEFAULT 1 CHECK ≥ min_select · `sort_order` int NOT NULL DEFAULT 0 · `is_active` bool NOT NULL DEFAULT true | 예: "설탕 양" min 1 max 1 (단일 선택), "토핑" min 0 max 3 |
| `option_group_translations` | `option_group_id` FK CASCADE · `locale` · `name` NOT NULL · PK `(option_group_id, locale)` | |
| `options` | `id` uuid PK · `option_group_id` uuid FK CASCADE · `extra_price` int NOT NULL DEFAULT 0 CHECK ≥0 · `sort_order` int NOT NULL DEFAULT 0 · `is_active` bool NOT NULL DEFAULT true | F-03 추가 가격(0 포함) |
| `option_translations` | `option_id` FK CASCADE · `locale` · `name` NOT NULL · PK `(option_id, locale)` | |
| `counters` | `key` text PK · `value` bigint NOT NULL DEFAULT 0 | 시드: `('pickup_number', 0)`. 픽업 번호는 `value+1` (DECISIONS #4) |
| `orders` | `id` uuid PK · `pickup_number` int NOT NULL UNIQUE · `status` order_status NOT NULL DEFAULT 'pending' · `payment_method` payment_method NOT NULL (`transfer` = 계좌이체) · `total_amount` int NOT NULL CHECK ≥0 · `idempotency_key` uuid NOT NULL UNIQUE · `status_token` text NOT NULL UNIQUE · `locale` text NOT NULL DEFAULT 'ko' · `transfer_reported_at` timestamptz NULL · `cancel_requested_at` timestamptz NULL · `cancel_rejected_at` timestamptz NULL · `acknowledged_at` timestamptz NULL · `acknowledged_by` uuid NULL · `paid_at`, `cooking_started_at`, `completed_at`, `closed_at` timestamptz NULL · `refund_channel` refund_channel NULL · `created_at`, `updated_at` timestamptz NOT NULL DEFAULT now() | 인덱스: `(status, created_at)`, `(created_at)`, `(pickup_number)`. `updated_at`은 트리거로 갱신(Realtime 병합 기준) |
| `order_items` | `id` uuid PK · `order_id` uuid FK→orders ON DELETE CASCADE · `menu_item_id` uuid FK→menu_items ON DELETE RESTRICT · `menu_name_ko` text NOT NULL · `menu_name_en` text NULL · `unit_price` int NOT NULL · `quantity` int NOT NULL CHECK >0 · `options_price` int NOT NULL DEFAULT 0 · `line_total` int NOT NULL · `sort_order` int NOT NULL DEFAULT 0 | 스냅샷. `line_total = (unit_price + options_price) * quantity` (함수가 계산·CHECK) |
| `order_item_options` | `id` uuid PK · `order_item_id` uuid FK CASCADE · `option_id` uuid FK→options ON DELETE RESTRICT · `option_group_name_ko` text NOT NULL · `option_name_ko` text NOT NULL · `option_name_en` text NULL · `extra_price` int NOT NULL | 스냅샷 |
| `order_status_history` | `id` bigserial PK · `order_id` uuid FK CASCADE · `from_status` order_status NULL · `to_status` order_status NOT NULL · `action` text NOT NULL · `actor_type` actor_type NOT NULL · `actor_id` uuid NULL · `reason` text NULL · `created_at` timestamptz NOT NULL DEFAULT now() | F-14 이력. 인덱스 `(order_id, created_at)` |
| `app_settings` | `key` text PK · `value` text NOT NULL · `updated_at` timestamptz NOT NULL DEFAULT now() · `updated_by` uuid NULL | 키 목록·기본값은 ADR-0004 |
| `rate_limits` (`0018_rate_limit.sql`, T-51) | `scope` text · `key` text(IP sha256 앞 32자 — 원본 IP 저장 금지) · `window_start` timestamptz · `count` int NOT NULL DEFAULT 0 · PK `(scope, key, window_start)` | F-47. 행은 `consume_rate_limit`가 1시간 지난 것을 삭제. ADR-0009 |

Enum: `order_status` (위 7개) · `payment_method ('cash','transfer')` — `transfer`는 계좌이체 · `refund_channel ('cash','bank')` (2026-09-24: 간편결제 제외로 `transfer_method` enum·컬럼 삭제, `refund_channel`에서 kakaopay·toss 삭제 — 후속 마이그레이션 T-53) · `actor_type ('admin','system','customer')`.

Postgres 함수(작업별 파일 — 번호는 2-1절 표, 전부 `SECURITY INVOKER`, `REVOKE EXECUTE … FROM anon, authenticated` — service_role만 호출):

| 함수 | 시그니처 | 예외 코드(메시지 문자열) |
|---|---|---|
| `create_order` | `(p_idempotency_key uuid, p_payment_method payment_method, p_locale text, p_items jsonb) RETURNS jsonb` — ADR-0002 | `OUT_OF_STOCK` (detail: menu_item_id, available) · `MENU_UNAVAILABLE` · `INVALID_OPTION` · `EMPTY_ITEMS` |
| `transition_order` | `(p_order_id uuid, p_from order_status, p_to order_status, p_action text, p_actor_type actor_type, p_actor_id uuid, p_reason text, p_refund_channel refund_channel) RETURNS orders` | `STATE_CHANGED` (CAS 실패) · `TERMINAL_STATE` · `ORDER_NOT_FOUND` |
| `sweep_order_timeouts` | `(p_now timestamptz DEFAULT now()) RETURNS jsonb {expired, completed}` — ADR-0006 | 없음(건별 CAS 실패는 건너뜀) |
| `count_waiting_before` | `(p_created_at timestamptz DEFAULT NULL) RETURNS int` — NULL이면 전체 미완료 수 | 없음 |
| `consume_rate_limit` (`0018_rate_limit.sql`) | `(p_scope text, p_key text, p_limit int, p_window_seconds int, p_now timestamptz DEFAULT now()) RETURNS boolean` — 고정 윈도 원자적 증가, 한도 도달 시 `false` — ADR-0009 | 없음(`false` 반환) |

트리거: `orders`·`menu_items`에 `updated_at = now()` BEFORE UPDATE.

### 2-1. 마이그레이션 번호 배정 (2026-09-25 — 신우석(BE1) 제안 채택)

운영 DB는 이미 적용된 번호보다 작은 새 파일을 거부하고, CI는 빈 DB에 번호 순서대로 적용하므로 번호 충돌·역순을 잡지 못한다. 그래서 번호를 미리 배정한다.

| 규칙 | 내용 |
|---|---|
| 1. 번호 미리 배정 | 새 마이그레이션은 아래 표의 번호만 쓴다. 0002·0004~0006은 결번(원래 예약분 — 0007 이후가 먼저 만들어져 쓰지 않음) |
| 2. 표에 없는 파일 | 이 표에 행을 먼저 추가(PR)한 뒤 파일을 만든다. "지금 가장 큰 번호 + 1"을 각자 쓰지 않는다 |
| 3. 의존 순서 | 다른 파일의 함수·구조를 쓰는 파일은 그 파일보다 뒤 번호 |
| 4. 병합 순서 = 번호 순서 | 운영 DB에는 번호 순서대로 적용. 순서가 어긋나면 병합 직전에 파일 이름을 "현재 최대 번호 + 1"로 바꾸고 이 표를 고친다 — 운영 적용 전에만 허용 |

| 번호 | 파일 | 내용 | 작업 · 담당 | 뒤에 와야 할 번호 | 현황(2026-09-25) |
|---|---|---|---|---|---|
| 0001 | `0001_schema.sql` | 1차 스키마 | T-03 · DB1 | — | dev 병합 |
| 0003 | `0003_rls.sql` | RLS 정책 | T-03 · DB1 | 0001 | dev 병합 |
| 0007 | `0007_t03_schema_hardening.sql` | T-03 보완 | T-03 · DB1 | 0001 | `feature/db-schema` 브랜치 |
| 0008 | `0008_t53_remove_easy_pay.sql` | 간편결제 제외 | T-53 · DB1 | 0007 | `feature/db-schema` 브랜치 |
| 0009 | `0009_transition_order.sql` | `transition_order` | T-14 · BE1 | 0008 | `feat/T-14-transition-order` 브랜치 |
| 0010 | `0010_create_order.sql` | `create_order`(멱등키·픽업 번호·토큰 포함) | T-07·T-08 · DB1 | 0008 | 원격 브랜치 없음 |
| 0011 | `0011_sweep_expire.sql` | `sweep_order_timeouts` — 만료 부분 | T-18 · DB2 | 0009 | 원격 브랜치 없음 |
| 0012 | `0012_sweep_auto_complete.sql` | `sweep_order_timeouts` 자동 완료 부분(`CREATE OR REPLACE`) | T-19 · DB2 | 0011 | 원격 브랜치 없음 |
| 0013 | `0013_realtime.sql` | Realtime publication | T-15 · BE2 | 0001 | 원격 브랜치 없음 |
| 0015 | `0015_pg_cron.sql`(선택) | 스윕 스케줄 | T-18·T-19 · DB2 | 0012 | 원격 브랜치 없음 |
| 0016 | `0016_get_stats.sql` | `get_stats` 매출·메뉴 판매율 집계 | T-21 · DB2 | 0012 | `dev` 병합, 운영 적용(DB1, 2026-10-01 확인 — DECISIONS #47) |
| 0017 | `0017_count_waiting_before.sql` | `count_waiting_before` 대기인원 집계 함수 | T-11 · BE2 | 0001 | `dev` 병합(#61), 운영 적용(팀장, 2026-10-01 SQL Editor — 권한·설정 확인 완료). 적용 이력 표(`supabase_migrations.schema_migrations`)에는 없으므로 DB1의 다음 `supabase db push`가 한 번 더 실행하고 기록한다(`CREATE OR REPLACE`·`REVOKE`·`GRANT`라 재실행 무해) |
| 0018 | `0018_rate_limit.sql` | `rate_limits` + `consume_rate_limit` | T-51 · DB1 | 0001 | PR #62, 병합 대기. 기존 0014에서 재번호 부여(DECISIONS #45), 운영 적용은 병합 후 DB1이 수행 |
| 01xx | 2차 스키마 | 2차 확장(4절) | 각 2차 작업 | 1차 전부 | — |
| 0100 | `0100_shifts.sql` | 교대 스케줄 `shifts` 및 RLS | T-46 · DB1 | 0019(운영 적용 순서) | 신규 배정. 0018·0019 이후 운영 적용 |
| 0101 | `0101_menu_recommendation.sql` | 메뉴별 추천 여부 `is_recommended` | T-38 · DB1 | 0100(운영 적용 순서) | 신규 배정. 기본값 false, NOT NULL; 기존 메뉴 RLS 유지 |
| 0102 | `0102_reviews.sql` | 후기 테이블·제약·RLS·완료 주문 검사 | T-41 · DB1 | 0101(운영 적용 순서) | 신규 배정. 저장 API는 아래 고객 API 규격, 고객 폼 연결은 후속 |

> **운영 DB 적용 현황(2026-10-01)**: `0001`·`0003`·`0007`~`0013`·`0016`·`0017` 적용(`0016`은 DB1 서동혁이 `supabase db push`, `0017`은 팀장이 SQL Editor로 — 이력 표에는 다음 `db push` 때 기록). `seed.sql` 운영 적용 완료(10-01 — 메뉴 4·초기 재고 100×4·번역 8·설정 6, DECISIONS #50, T-36). 남은 적용 순서는 `0018` → `0019`이고, `0014`(PR #62)·`0015`(PR #52)는 병합 직전 규칙 4에 따라 `0018`·`0019`로 이름을 바꾼다(DECISIONS #45). 위 표의 현황 열은 2026-09-25 기준이다.

### 3. RLS 정책 표 (`0003_rls.sql`, N-04)

원칙(ADR-0001): anon 역할에는 **정책 0개**(모든 테이블 거부). authenticated(관리자)는 Realtime·읽기용 SELECT만. 모든 쓰기는 service_role(RLS 우회)로 Route Handler에서만.

| 테이블 | anon | authenticated | service_role |
|---|---|---|---|
| `menu_items`, `*_translations`, `option_groups`, `options` | 거부 | SELECT | 전부 |
| `counters` | 거부 | 거부 | 전부 |
| `orders` | 거부 | SELECT (Realtime 구독용) | 전부 |
| `order_items`, `order_item_options`, `order_status_history` | 거부 | SELECT | 전부 |
| `app_settings` | 거부 | SELECT | 전부 |
| `rate_limits` | 거부 | 거부 | 전부 |
| 함수 5종 (`consume_rate_limit` 포함) | EXECUTE 거부 | EXECUTE 거부 | EXECUTE |

검증(T-13 통합 테스트): anon 클라이언트로 `orders`, `menu_items`, `app_settings` SELECT → 빈 결과 또는 거부; anon `rpc('create_order')` → 거부; authenticated `orders` UPDATE → 거부. Realtime: `0004_realtime.sql`에서 `ALTER PUBLICATION supabase_realtime ADD TABLE orders`.

### 4. 2차 예정 스키마 (1차 마이그레이션에 포함하지 않음 — 예약만, DECISIONS #33)

| 기능 | 변경 | 착수 게이트 |
|---|---|---|
| F-34 수기 입력 | `orders.source text NOT NULL DEFAULT 'customer'` (`'customer'|'manual'`), `orders.manual_ordered_at` | T-28 |
| F-33 직원 호출 | `staff_calls(id, order_id FK, called_at, acknowledged_at, acknowledged_by)`; 2분 중복 방지는 서비스에서 `max(called_at)` 비교 | T-27 |
| F-35 추천 | `menu_items.is_recommended boolean NOT NULL DEFAULT false` — `0101_menu_recommendation.sql`. 기존·신규 메뉴 기본 OFF, 복수 추천 허용. 기존 메뉴 RLS 유지: authenticated SELECT만, 쓰기는 관리자 API의 service_role | T-38 · Open Question #25(a)(c) 확정. 관리자 UI #97·T-20 API·FE1 고객 노출 연결은 각 담당 후속 |
| F-35 템플릿 | `option_templates(id, menu_item_id, name, option_ids uuid[])` | T-39 · Open Question #25(b) 확정 |
| F-36 재고 임박 | `app_settings 'stock.low_threshold'`, `stock_alerts(id, menu_item_id, kind, created_at, acknowledged_at)` | #26 확인 후 T-40 |
| F-37 후기 | `reviews(order_id uuid PK/FK→orders ON DELETE CASCADE, rating int NOT NULL CHECK 1..5, text NULL CHECK char_length≤200, created_at timestamptz NOT NULL DEFAULT now())` — `0102_reviews.sql`. 완료 주문 검사 트리거, authenticated SELECT만·쓰기 service_role | T-41 DB1 · #27 확정. API는 주문 토큰 검증 후 INSERT, 고객 폼·관리자 목록 연결은 후속 |
| F-38 특가 | `promotions(id, menu_item_id, sale_price, starts_at, ends_at)`, `order_items.promotion_id`, `order_items.list_price` | #28 확인 후 T-43 |
| F-39 배달 + F-12/N-17 전화번호 | `orders.fulfillment ('pickup'|'delivery') DEFAULT 'pickup'`, `delivery_location text`, `phone_encrypted text`, `phone_consented_at timestamptz` + CHECK — ADR-0008 | #29·#33 확인 후 T-45/T-49. "배달중" 상태 추가 시 팀장 재검토 |
| F-40 스케줄 | `shifts(id uuid PK, person_name text, date date, starts_at time(0), ends_at time(0), role text)` — `0100_shifts.sql`. 이름 1~80자, 역할 1~100자, 공백만 입력 금지. KST 날짜·분 단위 자유 시간대, 종료 > 시작, 같은 날짜 안의 구간, 겹침 허용 | T-46 · Open Question #30 확정. anon 접근 거부, authenticated SELECT만(RLS), 쓰기는 관리자 API의 service_role |
| F-46 메뉴 등록·삭제 | 스키마 변경 없음(`is_active` 사용, DECISIONS #22) | T-37 |

### 5. API 규격 — 공통

- Base: 같은 오리진 `/api`. JSON, UTF-8. 시각은 ISO 8601 UTC 문자열.
- 에러 봉투: `{ "error": { "code": ErrorCode, "message": string, "details"?: unknown } }`. `message`는 `AppError` 생성자에서 받지 않고 API 응답 변환 시 `code`에 대응하는 개발자용 영문 고정 문구로 정한다. 화면 문구는 클라이언트가 `code`로 `messages/*.json`에서 찾는다.
- 요청 스키마는 `src/lib/dto/*.ts`의 zod가 원본이며 아래 표는 그 요약이다. 표와 zod가 다르면 zod를 고치지 말고 architect에게 보고.

| ErrorCode | HTTP | 발생 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | zod 실패 (`details` = zod issues) |
| `REASON_REQUIRED` | 400 | cancel/refund 사유 빈값 |
| `REFUND_CHANNEL_REQUIRED` | 400 | refund에 채널 없음/불일치 |
| `UNAUTHORIZED` | 401 | 관리자 세션 없음 |
| `NOT_FOUND` | 404 | 주문·메뉴 없음, 토큰 불일치(존재 여부를 구분하지 않음 — F-10 "404 동등") |
| `MENU_UNAVAILABLE` | 409 | 비활성·품절 메뉴 (`details: {menuItemId}`) |
| `OUT_OF_STOCK` | 409 | 재고 부족 (`details: [{menuItemId, requested, available}]`) |
| `INVALID_OPTION` | 409 | 옵션 ID가 메뉴에 속하지 않거나 min/max 위반 |
| `INVALID_TRANSITION` | 409 | 상태 머신 불허 |
| `STATE_CHANGED` | 409 | CAS 실패(다른 관리자가 먼저 바꿈) — 클라이언트는 최신 상태로 갱신 후 안내 |
| `CANCEL_REQUEST_NOT_ALLOWED` | 409 | 조리중 이후 또는 거절됨/이미 요청됨 이외의 불가 상태 |
| `REVIEW_NOT_ALLOWED` | 409 | 완료 외 주문의 후기 제출(조회 후 상태 변경 경합 포함) |
| `REVIEW_ALREADY_SUBMITTED` | 409 | 이미 후기가 있는 주문의 재제출·동시 중복 제출 — 기존 내용·시각 유지 |
| `RATE_LIMITED` | 429 | `POST /api/orders`만. IP당 분당 100건 초과 (`details: { retryAfterSeconds }`, 헤더 `Retry-After`). 멱등 재요청은 대상 아님. 4xx라 자동 재시도 없음 → 수동 재시도 버튼 + 장바구니 유지 (F-47, ADR-0009) |
| `INTERNAL_ERROR` | 500 | 그 외 — 스택·DB 메시지 노출 금지 |

### 6. 고객 API (비로그인, 서버는 service_role)

| 메서드·경로 | 요청 | 응답 (200 기본) | 규칙 |
|---|---|---|---|
| `GET /api/health` | — | `{ ok: true, db: true, time }` | DB `select 1` 실패 시 503 `{ ok:false, db:false }`. 대시보드 연결 감시용 |
| `GET /api/menu?lang=ko` | `lang` ∈ SUPPORTED_LOCALES(기본 ko) | `MenuResponse { items: MenuItemDto[], waitingCount: number, locale }` · `MenuItemDto { id, name, description, price,…9711 tokens truncated… 끔)로 배포. `/api/health` 200 `db:true`, 스모크 5단계 통과(현금 주문 → 현금 수령 확인 → 조리 완료). 주소·결과는 `T-25-deployment.md` 7절 — 계정 서브도메인은 바꿀 예정(팀장 결정 10-02) — 새 주소로 다시 확정. 팀장 진행
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
