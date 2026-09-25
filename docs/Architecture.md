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
| 차트 | recharts | F-30 메뉴별 판매율 (DECISIONS #28) |
| 테스트 | Vitest(단위·통합), Playwright(E2E), Supabase CLI 로컬 스택 | ADR-0007 |
| 배포 | Cloudflare Workers Free + Supabase Free, `*.workers.dev` | N-14. 한도는 "배포" 절 |
| 패키지·런타임 | npm, Node 20 LTS | DECISIONS #28 |

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
[클라이언트] 장바구니·멱등키 폐기 → router.replace(`/orders/${statusToken}`)
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
| `cancel_request_reject` | pending/paid AND `cancel_requested_at IS NOT NULL` | admin | `cancel_rejected_at = now()`, 이력 행(사유 선택) (F-18) |

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
| `rate_limits` (`0014_rate_limit.sql`, T-51) | `scope` text · `key` text(IP sha256 앞 32자 — 원본 IP 저장 금지) · `window_start` timestamptz · `count` int NOT NULL DEFAULT 0 · PK `(scope, key, window_start)` | F-47. 행은 `consume_rate_limit`가 1시간 지난 것을 삭제. ADR-0009 |

Enum: `order_status` (위 7개) · `payment_method ('cash','transfer')` — `transfer`는 계좌이체 · `refund_channel ('cash','bank')` (2026-09-24: 간편결제 제외로 `transfer_method` enum·컬럼 삭제, `refund_channel`에서 kakaopay·toss 삭제 — 후속 마이그레이션 T-53) · `actor_type ('admin','system','customer')`.

Postgres 함수(작업별 파일 — 번호는 2-1절 표, 전부 `SECURITY INVOKER`, `REVOKE EXECUTE … FROM anon, authenticated` — service_role만 호출):

| 함수 | 시그니처 | 예외 코드(메시지 문자열) |
|---|---|---|
| `create_order` | `(p_idempotency_key uuid, p_payment_method payment_method, p_locale text, p_items jsonb) RETURNS jsonb` — ADR-0002 | `OUT_OF_STOCK` (detail: menu_item_id, available) · `MENU_UNAVAILABLE` · `INVALID_OPTION` · `EMPTY_ITEMS` |
| `transition_order` | `(p_order_id uuid, p_from order_status, p_to order_status, p_action text, p_actor_type actor_type, p_actor_id uuid, p_reason text, p_refund_channel refund_channel) RETURNS orders` | `STATE_CHANGED` (CAS 실패) · `TERMINAL_STATE` · `ORDER_NOT_FOUND` |
| `sweep_order_timeouts` | `(p_now timestamptz DEFAULT now()) RETURNS jsonb {expired, completed}` — ADR-0006 | 없음(건별 CAS 실패는 건너뜀) |
| `count_waiting_before` | `(p_created_at timestamptz DEFAULT NULL) RETURNS int` — NULL이면 전체 미완료 수 | 없음 |
| `consume_rate_limit` (`0014_rate_limit.sql`) | `(p_scope text, p_key text, p_limit int, p_window_seconds int, p_now timestamptz DEFAULT now()) RETURNS boolean` — 고정 윈도 원자적 증가, 한도 도달 시 `false` — ADR-0009 | 없음(`false` 반환) |

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
| 0014 | `0014_rate_limit.sql` | `rate_limits` + `consume_rate_limit` | T-51 · DB1 | 0001 | 원격 브랜치 없음 |
| 0015 | `0015_pg_cron.sql`(선택) | 스윕 스케줄 | T-18·T-19 · DB2 | 0012 | 원격 브랜치 없음 |
| 01xx | 2차 스키마 | 2차 확장(4절) | 각 2차 작업 | 1차 전부 | — |

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
| F-35 추천·템플릿 | `menu_items.is_recommended bool`, `option_templates(id, menu_item_id, name, option_ids uuid[])` | #25 확인 후 T-38/T-39 |
| F-36 재고 임박 | `app_settings 'stock.low_threshold'`, `stock_alerts(id, menu_item_id, kind, created_at, acknowledged_at)` | #26 확인 후 T-40 |
| F-37 후기 | `reviews(order_id PK/FK, rating int CHECK 1..5, text, created_at)` | #27 확인 후 T-41 |
| F-38 특가 | `promotions(id, menu_item_id, sale_price, starts_at, ends_at)`, `order_items.promotion_id`, `order_items.list_price` | #28 확인 후 T-43 |
| F-39 배달 + F-12/N-17 전화번호 | `orders.fulfillment ('pickup'|'delivery') DEFAULT 'pickup'`, `delivery_location text`, `phone_encrypted text`, `phone_consented_at timestamptz` + CHECK — ADR-0008 | #29·#33 확인 후 T-45/T-49. "배달중" 상태 추가 시 팀장 재검토 |
| F-40 스케줄 | `shifts(id, person_name, date, starts_at, ends_at, role)` | #30 확인 후 T-46 |
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
| `RATE_LIMITED` | 429 | `POST /api/orders`만. IP당 분당 100건 초과 (`details: { retryAfterSeconds }`, 헤더 `Retry-After`). 멱등 재요청은 대상 아님. 4xx라 자동 재시도 없음 → 수동 재시도 버튼 + 장바구니 유지 (F-47, ADR-0009) |
| `INTERNAL_ERROR` | 500 | 그 외 — 스택·DB 메시지 노출 금지 |

### 6. 고객 API (비로그인, 서버는 service_role)

| 메서드·경로 | 요청 | 응답 (200 기본) | 규칙 |
|---|---|---|---|
| `GET /api/health` | — | `{ ok: true, db: true, time }` | DB `select 1` 실패 시 503 `{ ok:false, db:false }`. 대시보드 연결 감시용 |
| `GET /api/menu?lang=ko` | `lang` ∈ SUPPORTED_LOCALES(기본 ko) | `MenuResponse { items: MenuItemDto[], waitingCount: number, locale }` · `MenuItemDto { id, name, description, price, stock, isAvailable, isSoldOut, imageUrl, optionGroups: [{ id, name, minSelect, maxSelect, options: [{ id, name, extraPrice }] }] }` | `is_active` 메뉴만. `isSoldOut = is_sold_out_manual OR stock=0`, `isAvailable = !isSoldOut`. 이름은 요청 언어 → ko 폴백. 비활성 옵션·그룹 제외. `waitingCount` = 전체 미완료 수(F-11 메뉴판) |
| `GET /api/queue` | — | `{ waitingCount }` | 메뉴판 주기 갱신(30초)용 |
| `GET /api/settings/transfer` | — | `TransferSettingsDto { configured: boolean, bankName, accountNumber, accountHolder }` | `transfer.*` 키만(계좌 정보 3개). 빈값은 `''`. `configured` = 은행 3값 모두 비어있지 않음. 비어 있으면 서버 `warn` 로그(F-44) |
| `POST /api/orders` | `CreateOrderRequest { idempotencyKey: uuid, paymentMethod: 'cash'|'transfer' (transfer = 계좌이체), locale, items: [{ menuItemId: uuid, quantity: int 1..99, optionIds: uuid[] }] (1..20개) }` — 가격 필드 없음(있어도 zod `strict`로 400) | 201 신규 / 200 멱등 재요청: `CreateOrderResponse { orderId, pickupNumber, statusToken, status, totalAmount, createdAt, created: boolean }` | `paymentMethod` 누락·허용 외 값 → 400. 멱등키 기존 주문이면 속도 제한 미소비로 200. 신규면 `consume_rate_limit` → 초과 시 429 `RATE_LIMITED`(ADR-0009). 이후 ADR-0002 함수. 에러 409 OUT_OF_STOCK 등 |
| `GET /api/orders/{token}` | 경로 토큰 64 hex | `OrderStatusDto { orderId, pickupNumber, status, paymentMethod, totalAmount, items: [{ name, quantity, options: string[], lineTotal }], createdAt, transferReportedAt, cancelRequestedAt, cancelRejectedAt, aheadCount, canTransferReport, canCancelRequest }` | 토큰 형식 불일치·미존재 모두 404. `aheadCount` = `count_waiting_before(created_at)`. `name`/`options`는 주문 시 `locale` 기준 스냅샷(ko 폴백). 클라이언트 5초 폴링 |
| `POST /api/orders/{token}/transfer-report` | 본문 없음 | `{ transferReportedAt }` | `status='pending' AND payment_method='transfer'`가 아니면(현금 주문 포함) 409 `INVALID_TRANSITION`. 이미 신고됨이면 기존 시각 그대로 200(멱등, F-43) |
| `POST /api/orders/{token}/cancel-request` | 본문 없음 | `{ cancelRequestedAt }` | `status ∈ {pending,paid}` 아님 또는 `cancel_rejected_at` 있음 → 409 `CANCEL_REQUEST_NOT_ALLOWED`. 이미 요청됨이면 기존 시각 200(멱등, F-45) |

### 7. 관리자 API (전부 `requireAdmin()` — 세션 없으면 401)

| 메서드·경로 | 요청 | 응답 | 규칙 |
|---|---|---|---|
| `GET /api/admin/orders?date=YYYY-MM-DD&status=&pickupNumber=` | `date` 기본 오늘(KST). `status` 콤마 목록 선택. `pickupNumber` 정수(있으면 date 무시) | `{ orders: AdminOrderDto[], unacknowledgedCount }` — `created_at DESC` | `AdminOrderDto { id, pickupNumber, status, paymentMethod, totalAmount, items: [{ menuNameKo, quantity, options: [{ nameKo, extraPrice }], lineTotal }], createdAt, updatedAt, acknowledgedAt, transferReportedAt, cancelRequestedAt, cancelRejectedAt, paidAt, cookingStartedAt, completedAt, closedAt, refundChannel, lastReason, availableActions: TransitionAction[] }`. F-22: `pickupNumber` 결과 0건이면 `orders: []` |
| `GET /api/admin/orders/{id}` | — | `AdminOrderDto` | Realtime INSERT 하이드레이션용 |
| `POST /api/admin/orders/{id}/acknowledge` | — | `AdminOrderDto` | 이미 확인됨이면 그대로 200 |
| `POST /api/admin/orders/{id}/transition` | `{ action: 'confirm_payment'|'confirm_cash'|'start_cooking'|'complete'|'cancel'|'refund', reason?: string(1..200), refundChannel?: RefundChannel }` | `AdminOrderDto` | 상태 머신 절. `actor_type='admin', actor_id=user.id` |
| `POST /api/admin/orders/{id}/cancel-request` | `{ decision: 'approve'|'reject', reason: string(1..200) }` | `AdminOrderDto` | approve = `transition(action='cancel', reason)`; reject = `cancel_rejected_at` 설정 + 이력(`cancel_request_reject`). `cancel_requested_at` 없으면 409 `INVALID_TRANSITION` |
| `GET /api/admin/menus` | — | `{ menus: AdminMenuDto[] }` · `AdminMenuDto { id, translations: { [locale]: { name, description } }, basePrice, stock, isSoldOutManual, isActive, sortOrder, imageUrl, optionGroups: [{ id, translations, minSelect, maxSelect, isActive, options: [{ id, translations, extraPrice, isActive }] }] }` | 비활성 포함(1차 UI는 수정만) |
| `PATCH /api/admin/menus/{id}` | `{ basePrice?: int≥0, stock?: int≥0, isSoldOutManual?: bool, translations?: { [locale]: { name: string≥1, description?: string } } }` | `AdminMenuDto` | ko `name` 빈값 → 400. 재고 0이면 `isSoldOut` 파생(F-25) — 별도 플래그 저장 없음 |
| `PATCH /api/admin/option-groups/{id}` | `{ translations?, minSelect?, maxSelect?, isActive? }` | `AdminMenuDto`(소속 메뉴) | max ≥ min 아니면 400 |
| `PATCH /api/admin/options/{id}` | `{ translations?, extraPrice?: int≥0, isActive? }` | `AdminMenuDto` | |
| `GET /api/admin/stats?date=YYYY-MM-DD` | `date` 기본 오늘(KST); `date=all` 허용 | `StatsDto { date, sales, orderCount, refundedAmount, refundedCount, byMenu: [{ menuItemId, nameKo, quantity, ratio }], totals: { pending, paid, cooking, completed, cancelled, refunded, expired } }` | DECISIONS #19 규칙. `byMenu`는 status ∈ {paid,cooking,completed} 항목 수량 합, `ratio` = 수량/총수량(0건이면 `[]`) |
| `GET /api/admin/stats/csv?from=YYYY-MM-DD&to=YYYY-MM-DD` | 기본 축제 전체(2026-10-07~08 — `app_settings`가 아니라 요청 기본값 상수 `FESTIVAL_DATES`) | `text/csv; charset=utf-8` + BOM, `Content-Disposition: attachment; filename="orders_{from}_{to}.csv"` | 헤더 13개(DECISIONS #20, 2026-09-24 `송금 하위 수단` 삭제): `주문 ID,픽업 번호,주문 시각,메뉴,옵션,수량,금액,결제수단,상태,취소/환불 사유,주문 합계,결제확인 시각,완료 시각`. 옵션은 `;`로 연결. 상태·결제수단은 한글 라벨. 0건이면 헤더만 |
| `GET /api/admin/settings` | — | `{ settings: { [key]: string } }` | 전체 키 |
| `PUT /api/admin/settings` | `{ settings: { [key]: string } }` (ADR-0004 키만, 키별 zod: `payment.expire_minutes` int 1..120, `auto_complete.enabled` `'true'|'false'`, `auto_complete.minutes` int 1..120, `transfer.*` string ≤200) | `{ settings }` (전체 키) | 부분 갱신 — 전달된 키만 upsert, 나머지 유지. 알 수 없는 키 400(`VALIDATION_ERROR`, `details`에 키). `transfer.*`는 빈 문자열 허용(= "미입력"). `updated_by = user.id`. F-48 설정 패널의 저장 경로 |
| `POST /api/admin/sweep` | — | `{ expired, completed }` | ADR-0006 폴백. 멱등 |

### 8. 화면 메커니즘 (PRD "화면" 절 실현)

라우팅·상태 소유·컴포넌트 경계. 시각 완성도는 디자인 재량(PRD #3).

| 화면 | 경로 | 상태 소유자(훅) | 데이터 원천·갱신 | 빈 값·로딩·에러 처리 위치 |
|---|---|---|---|---|
| 고객 메뉴판 | `/` | `useMenu(locale)` — `{ status: 'loading'|'ready'|'error', items, waitingCount, reload }` | `GET /api/menu` 마운트 시 + `GET /api/queue` 30초 | 로딩: `MenuSkeleton`; 에러: `ErrorRetry`(reload); 빈 값: `isAvailable` 메뉴 0개 → `EmptyState('menu.empty')`; 품절: `MenuCard disabled` + 라벨. 언어: `layout.tsx`가 쿠키/쿼리로 결정해 `LocaleProvider`로 하위 전달 |
| 메뉴 상세(옵션·수량) | `/`의 `MenuDetailSheet`(모달, 라우트 없음) | `useCart`(zustand) `addItem` | 클라이언트 | 수량 상한 = `stock`(F-02) — `QuantityStepper max`. 옵션 min/max 미충족 시 담기 비활성 |
| 장바구니 | `/cart` | `useCart` — `items, total(=domain/pricing), update, remove, clear` + `useMenu`로 품절 재검사 | sessionStorage + 마운트 시 `GET /api/menu` | 빈 값: `EmptyCart` + 메뉴판 링크, 주문 버튼 비활성; 담은 메뉴가 품절/비활성 → 항목 경고 + 진행 차단 |
| 결제수단 선택/확정 | `/checkout` | `useCheckout` — `{ paymentMethod, idempotencyKey, submitting, error, submit }` | `POST /api/orders` (재시도 DECISIONS #24) | 미선택 → 확정 비활성; `submitting` 중 버튼 잠금; `OUT_OF_STOCK` → `details`로 항목 표시 + `/cart` 복귀; 네트워크 실패 → 수동 재시도 버튼(장바구니 유지); `RATE_LIMITED`(429) → `errors.RATE_LIMITED` 문구("잠시 후 다시 시도") + 같은 수동 재시도 버튼 + 장바구니·멱등키 유지(F-47); 성공 → cart·key 폐기 후 `/orders/{token}` |
| 주문 완료/상태 | `/orders/[token]` | `useOrderStatus(token)` — `{ status:'loading'|'ready'|'notFound'|'error', order, actions }` | `GET /api/orders/{token}` 5초 폴링 + `GET /api/settings/transfer`(계좌이체 주문만, 1회) | 404 → `NotFound('order.notFound')`; 로딩 표시; `TransferGuide`(계좌이체 안내 — 은행명·계좌번호·예금주·금액 + 복사 버튼 + 입금자명=픽업 번호 안내, 설정 빈값 → "준비 중"); `[송금했어요]`/`[취소 요청]` 버튼은 `canTransferReport`/`canCancelRequest`; 클릭 중 잠금, 실패 토스트; 거절됨 문구 `cancelRejectedAt` |
| 개인정보 고지 | `/privacy` | 없음(정적) | `messages` | 없음 — 정적. 고객 레이아웃 푸터 링크(1탭) |
| 관리자 로그인 | `/admin/login` | 로컬 폼 상태 | `supabase.auth.signInWithPassword`(브라우저 클라이언트) → 성공 시 `/admin` | 빈칸 → 제출 비활성; 오류 메시지 표시. 회원가입 링크 없음 |
| 대시보드 | `/admin` | `useOrdersFeed`(Map 병합, ADR-0003) + `useConnectionMonitor` + `useSettings` | Realtime + `/api/admin/orders` + 30초 `sweep` | 빈 값: "아직 주문이 없습니다"; 초기 로딩; `ConnectionBanner`(10초); 전환 실패 → 토스트 + 서버 응답으로 카드 되돌림(낙관적 갱신 안 함 — 서버 응답 후 갱신); 미확인 강조 = `acknowledgedAt==null`; 송금 신고·취소 요청 배지; `PickupSearch`는 Map 필터(클라이언트) — 오늘 범위 밖 번호면 `GET ?pickupNumber=`; `SettingsPanel`(F-48 — 아래 "설정 패널" 단락) |
| 메뉴·재고 관리 | `/admin/menus` | `useMenuAdmin` — 목록 + 항목별 편집 폼 상태 | `GET/PATCH /api/admin/menus…` | 빈 값: "메뉴가 없습니다 — 시드 데이터를 확인하세요"; 저장 중 잠금; 유효성(가격·재고 음수, ko 이름 빈칸) 즉시 표시; 실패 토스트 |
| 통계 | `/admin/stats` | `useStats(date)` | `GET /api/admin/stats`, CSV는 `<a href>` 다운로드 | 빈 값: "데이터 없음"(차트 미렌더); 로딩; 에러 + 재시도 |
| (2차) 수기 입력·스케줄·프로모션 | `/admin/manual-orders`, `/admin/shifts`, 고객 `/promotions` 또는 배너 | 착수 시 정의 | — | 세부 미정(#28~#31) 확정 후 팀장 갱신 |

설정 패널(F-48, `/admin` 안의 `SettingsPanel` — 별도 라우트 없음, 접힘/펼침 UI는 디자인 재량):

| 항목 | 결정 |
|---|---|
| 상태 소유자 | `useSettings` — `{ status: 'loading'\|'ready'\|'error', values: Record<SettingKey,string>, draft, setDraft(key,value), save(), saving, fieldErrors, reload }`. 마운트 시 `GET /api/admin/settings` 1회. `draft`는 폼 입력본, `values`는 서버 확정본 — 저장 성공 시 `values = 응답.settings`, 실패 시 `draft` 유지(F-48 "입력값 유지") |
| 편집 필드 | ADR-0004 키 6개 전부: `transfer.bank_name`·`transfer.account_number`·`transfer.account_holder`(text), `auto_complete.enabled`(토글), `auto_complete.minutes`(int 1..120), `payment.expire_minutes`(int 1..120) |
| 유효성 | `src/lib/dto/settings.ts`의 키별 zod를 클라이언트가 그대로 import해 `setDraft` 시 즉시 `fieldErrors` 갱신(서버와 같은 규칙, 이중 정의 없음). 범위 밖이면 저장 버튼 비활성 |
| 빈 값 | `transfer.*`가 `''`이면 필드 옆 "미입력" 경고 배지(저장은 허용 — 고객 화면은 F-44 "준비 중" 유지). 5개 전부 빈값이면 패널 상단 요약 경고 1줄 |
| 저장 | `PUT /api/admin/settings { settings: draft 중 values와 다른 키만 }`(부분 갱신). `saving` 중 패널 버튼 잠금. 실패 → 토스트 `errors.{code}` + `draft` 유지. 성공 → 토스트 "저장됨" |
| 반영 경로 | 서버 읽기 캐시 없음(ADR-0004) → 저장 직후 고객 `GET /api/settings/transfer`·`sweep_order_timeouts`가 새 값을 읽는다. 재배포 없음 |
| 컴포넌트 | `components/admin/SettingsPanel` props: `{ values, draft, fieldErrors, saving, onChange, onSave }` — fetch 없음(아래 컴포넌트 계약과 동일) |
| 폴백 | Supabase Table Editor 직접 편집(T-30 절차)은 유지 — 그 경우 검증이 없으므로 형식 예시를 T-30 문서에 |

재사용 컴포넌트 계약(요지): `components/*`는 props로만 데이터를 받고 fetch·전역 상태 접근을 하지 않는다(테스트·디자인 병렬을 위해). `OrderActionButtons`는 `availableActions`만 보고 버튼을 활성화한다 — 상태 머신 로직을 컴포넌트에 복제하지 않는다.

관리자 라우트 보호: `src/app/admin/(protected)/layout.tsx`(서버 컴포넌트)에서 `@supabase/ssr` 세션 클라이언트로 `getUser()` → 없으면 `redirect('/admin/login')`. 추가로 `middleware.ts`에서 `/admin/(?!login)` 경로에 세션 쿠키 갱신(`@supabase/ssr` 권장 패턴). API는 각 핸들러의 `requireAdmin()`이 최종 판정(레이아웃 가드는 UX용).

### 계층 규칙 (DB·외부 API가 있는 프로젝트만 — 없으면 "해당 없음" 기재)

기준은 [docs/guides/clean-architecture.md](guides/clean-architecture.md). 이 프로젝트에 적용할 결정만 아래에 적는다.

| 항목 | 결정 |
|---|---|
| 의존성 방향 | `domain` ← `services` ← `infra/repositories`·`app/api`·`features` ← `app/(pages)`. `domain`은 어떤 것도 import하지 않는다(zod 포함 — 타입만). `services`는 `ports.ts`와 `domain`만 import. `next/*`·`@supabase/*`는 `infra`와 `app`에서만 |
| Repository 포트 | `src/services/ports.ts`에 TS 인터페이스: `OrderRepository { createOrder(input): Promise<CreateOrderResult>; findByToken(token); findById(id); transition(...); setTransferReported(id); setCancelRequested(id); rejectCancelRequest(id, actorId, reason); acknowledge(id, actorId); list(filter); countWaitingBefore(createdAt?) }`, `MenuRepository`, `SettingsRepository`, `RateLimitRepository { consume(scope: string, key: string, limit: number, windowSeconds: number, now?: Date): Promise<boolean> }`(ADR-0009), `Clock { now(): Date }`. `OrderRepository`에 `findByIdempotencyKey(key)` 포함. 구현체는 `src/infra/repositories/supabase*.ts`. 주입은 함수 인자 기본값(`createOrder(dto, deps = defaultDeps())`) — DI 컨테이너 없음 |
| DTO ↔ 도메인 변환 위치 | 요청: Route Handler에서 zod parse → 서비스에 DTO 타입 전달. 응답: `src/infra/repositories/mappers.ts`의 `toAdminOrderDto`, `toOrderStatusDto`, `toMenuItemDto` — DB 행을 API로 직접 반환 금지(스프레드 금지, 필드 명시 나열 — 2차 `phone_encrypted` 누출 방지) |
| 순환 의존성 | 금지. `features` ↔ `components` 사이도 단방향(features가 components를 렌더, components는 features를 모른다). ESLint `import/no-cycle` + `no-restricted-imports`(`domain`·`services`에서 `next`, `@supabase` 금지)를 T-01에 설정 |

## 테스트 전략

케이스 도출·부실 테스트 방지 기준은 TDD 원칙을 따른다 (정상 1 + 경계 2 + 예외 2 이상, 실제 값 단언, 비동기 대기, 외부 의존성 격리). 아래에는 이 프로젝트의 선택만 적는다.

| 항목 | 결정 |
|---|---|
| 테스트 프레임워크 | 단위·통합: **Vitest** (+ `@testing-library/react`, `jsdom` 환경은 컴포넌트 테스트 파일에만 `// @vitest-environment jsdom`). E2E: **Playwright** (chromium, 고객 화면은 `devices['Pixel 7']`·`devices['iPhone 14']` 프로젝트 2개, 관리자는 데스크톱 chromium). 부하: k6 (2차 T-29, `tests/load/order-create.js`) |
| 테스트 디렉토리 배치 | `tests/unit/**/*.test.ts(x)` (DB 불필요, ports mock) · `tests/integration/**/*.test.ts` (로컬 Supabase 필수, 파일 직렬) · `tests/e2e/**/*.spec.ts`. 소스 옆 co-location 금지(6명 병렬 시 위치 규칙 하나로) |
| 커버 범위 기준 | N-13 목록을 최소 필수로: 가격 재계산·옵션 추가 가격·멱등키·재고 차감·연속 픽업 번호(통합), 재고 복구·환불(통합), 자동 만료 경계 + 송금 신고 제외(통합, `p_now` 주입), 송금 신고·취소 요청 멱등(통합), 대기 수(통합), 토큰 검증(통합), 상태 머신 표 전수(단위 — 7상태 × 8action 매트릭스, 불허가 409인지), 장바구니 합계·수량 경계(단위), 번역 폴백(단위), 피드 병합·연결 감시 타이머(단위, fake timers), CSV 헤더·합계 일치(단위). 속도 제한(F-47, T-51): `consume_rate_limit` 100회 `true`·101회째 `false`·`p_now`+60초 `true`(통합), 같은 멱등키 재요청 시 카운트 불변(통합), `getClientIp` 헤더 우선순위·없음→`'unknown'`(단위). 설정 패널(F-48, T-52): 키별 zod 범위(단위), `PUT` 부분 갱신·알 수 없는 키 400(통합). E2E 1개(T-24 시나리오). 수치 커버리지 임계값은 두지 않는다(요구 없음) |
| Mock/Stub 대상 (외부 의존성) | 단위: `ports.ts` 인터페이스를 in-memory 구현(`tests/unit/fakes/*.ts`)으로 대체, `Clock`은 고정 시각. 시간은 `vi.useFakeTimers()`. 통합: mock 없음 — 로컬 Supabase 실물(ADR-0007). E2E: 로컬 Supabase + `next dev`, 관리자 계정은 셋업에서 로컬 Auth Admin API로 생성. 외부 은행 앱은 테스트하지 않음(간편결제는 2026-09-24 제외) |
| T-01 스모크 범위 | (1) `tests/unit/smoke.test.ts` — `domain/i18n/locales.ts`의 `DEFAULT_LOCALE === 'ko'` 단언(도메인 모듈 import 경로 검증) (2) `tests/e2e/smoke.spec.ts` — `/` 접속 시 `<html lang>` 존재 + 200. (3) `npm run build` 성공. (4) CodingRules "검증된 명령어"에 `npm run dev` / `npm run build` / `npm run test` / `npm run test:e2e` / `npx supabase start` 원문 등록. (5) `.github/workflows/ci.yml` 생성 + 첫 push에서 녹색 확인(아래 CI 행). 통합 테스트 명령(`npm run test:integration`)은 T-02(로컬 Supabase 연결)에서 등록 |
| CI | **GitHub Actions 도입**(PRD Open Question #34 — 승인, DECISIONS #34). 파일 `.github/workflows/ci.yml`, 소유는 소스 코드(BE2). 트리거: 모든 브랜치 `push` + `dev`·`main` 대상 `pull_request`. 잡 ① `unit-build`(T-01): `ubuntu-latest`, `actions/setup-node` Node 20 + npm 캐시, `npm ci` → `npm run lint` → `npm run test` → `npm run build`(빌드용 `NEXT_PUBLIC_SUPABASE_URL`·`ANON_KEY`는 더미 값 — 빌드는 DB에 접속하지 않는다). 잡 ② `integration`(T-02에서 추가): `supabase/setup-cli` → `supabase start` → `npm run test:integration` → `supabase stop`. 로컬 스택 고정 키는 `supabase status -o env`로 잡 안에서 읽는다(GitHub Secrets 불필요 — 시크릿 0개). E2E는 CI 미포함 — Playwright 브라우저 설치·`next dev` 기동 비용 대비 E2E 1개(요구 없음, T-24 로컬 실행). 병합 게이트: DoD의 "테스트 통과"는 CI 녹색으로 증빙(수동 실행 출력 대체 가능) |
| 통합·E2E 로컬 실행 지침 (Docker) | PRD Open Question #38 운영 지침: **팀원 전원 Docker Desktop 설치 불가 판정(2026-09-22 팀장 지시)**. 로컬에서는 단위 테스트 위주로 실행하고, 통합 테스트는 GitHub Actions CI 잡 ②(`supabase start` 기반)에 맡긴다(ADR-0007 규격 유지). 검증 전환 요청에 첨부하는 통합 테스트 근거는 CI 실행 링크로 갈음한다 |

## 배포

docs/PRD.md의 "배포·운영" 항목이 요구사항이라면, 여기는 그 요구사항을 어떻게 실현하는지 메커니즘을 적는다. 모든 행에 결정 또는 명시적 "해당 없음 — 사유"를 적는다 — 빈칸 금지.

| 항목 | 결정 |
|---|---|
| 호스팅 / 실행 대상 | **Cloudflare Workers Free + Supabase Free** 프로젝트 1개(프로덕션). T-50(2026-09-23) 검증 결과 비용 0원 방침에 따라 Vercel Hobby를 사용하지 않고 Cloudflare Workers Free로 전환 확정. 현재 프로젝트는 Next.js 16 계열이므로 Cloudflare 공식 권장 경로인 `vinext`를 T-25에서 우선 검증한다. `npx vinext check`로 호환성을 확인한 뒤 문제 없으면 `vinext init`을 적용하고, 호환 문제가 있으면 OpenNext 어댑터를 폴백으로 검토한다. 도메인은 구매하지 않고 `{worker}.{account-subdomain}.workers.dev` 사용(N-14). Worker 이름과 account subdomain은 T-25에서 확정한 후 QR 인쇄 전 변경 금지. Workers Free는 100,000 requests/day, CPU 10ms/request 한도이므로 요청량은 예상 200건/일에 충분하나 SSR/API CPU 사용량은 T-25 스모크·T-29 부하 검증에서 확인한다. |
| 빌드·릴리스 파이프라인 | Cloudflare Workers Git 연동 기준으로 **`dev`를 프로덕션 배포 브랜치로 사용**한다. `dev`에 병합된 코드가 프로토타입 및 실제 운영 배포 대상으로 반영되도록 한다. feature 브랜치는 프리뷰 환경으로 확인한다. 테스트는 기존 GitHub Actions가 push·PR마다 실행하며, 병합 전 DoD에서 CI 녹색을 요구한다. 배포와 CI가 별도이므로 CI 실패 코드를 `dev`에 직접 push하지 않는다. |
| 환경과 승격 | 로컬(Supabase CLI 로컬 스택) → 프리뷰(Cloudflare 비프로덕션 배포, DB는 프로덕션 Supabase 공유) → 프로덕션(`dev`). 스테이징 DB는 두지 않는다. 축제 당일(10-07~08)에는 `dev` 외 배포·DB 마이그레이션을 금지한다(T-30 동결 규칙). |
| 환경별 설정 | Cloudflare Workers 환경변수/Secrets에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, (2차) `PHONE_ENCRYPTION_KEY`를 설정한다. `SUPABASE_SERVICE_ROLE_KEY`와 `PHONE_ENCRYPTION_KEY`는 서버 전용 Secret으로 관리한다. 로컬 값은 미커밋 파일에서 관리하고 `.env.example`에는 플레이스홀더만 둔다. 송금 정보·운영값은 환경변수가 아니라 `app_settings`에서 관리한다(ADR-0004). |
| DB·상태 마이그레이션 | `supabase/migrations/*.sql`이 원본. 적용: DB 담당이 `supabase link` 후 `supabase db push`(수동, 배포 전에 먼저). 순서 규칙: 컬럼 추가는 앱 배포 전, 컬럼 삭제는 앱 배포 후. 예외(2026-09-24): T-53의 `orders.transfer_method` 삭제는 이 컬럼을 쓰는 앱 코드가 아직 배포 전(P0)이라 배포 전에 적용 — 이후 삭제는 원칙대로 앱 배포 후. 시드: `supabase db reset`(로컬) / 프로덕션은 `seed.sql`의 멱등 INSERT를 SQL Editor에서 1회 실행(T-36). |
| 롤백 절차 | 앱: Cloudflare Workers Deployments에서 이전 배포 버전으로 Rollback한다. DB는 되돌리기 마이그레이션 없이 전진 수정(새 마이그레이션)을 원칙으로 한다. 데이터 손상 대비 축제 전 `supabase db dump`로 수동 백업 1회(T-25). |
| 헬스체크 / 스모크 테스트 | `GET /api/health`(DB 왕복 포함). 배포 후 T-25 수동 스모크: 프로덕션 URL에서 메뉴판 로드 → 현금 주문 1건 → 관리자 로그인 → 대시보드 표시 → 취소(테스트 주문 정리). 테스트 주문은 픽업 번호를 소비하므로 축제 전 `counters` 리셋을 T-25 마지막 단계로 한다. |
| 배포 전 필수 설정(Supabase 대시보드) | Auth → 이메일 회원가입 비활성화, 관리자 계정 2~3개 생성(F-20), pg_cron 가용 확인(ADR-0006). 절차는 T-30에 기록한다. |
## 에러 처리

전역 전략이다 — 기능별 메모가 아니다. 모든 행에 결정 또는 명시적 "해당 없음 — 사유"를 적는다.

| 항목 | 결정 |
|---|---|
| 예외를 잡는 위치 | Route Handler를 `withHandler(fn)`으로 감싸 여기서만 catch. 서비스·리포지토리는 `AppError(code, httpStatus, details?)`를 던진다. 리포지토리는 supabase/Postgres 에러(RPC의 `RAISE EXCEPTION 'OUT_OF_STOCK'` 등, `unique_violation`)를 `AppError`로 변환하는 유일한 곳. 클라이언트: `features/*` 훅이 `fetchJson` 실패를 `{ status:'error', code }`로 상태화 — 컴포넌트는 try/catch 없음. React 렌더 오류는 `app/(customer)/error.tsx`·`app/admin/error.tsx`(다시 시도 버튼) |
| 실패가 사용자에게 드러나는 방식 | HTTP 상태 + 봉투 `{ error: { code, message, details } }`(5절 표). 고객 화면은 `code`를 `messages/*.json`의 `errors.{code}` 문구로 표시(언어별), 알 수 없는 코드는 `errors.INTERNAL_ERROR`. 관리자 화면은 토스트 + 서버 최신 상태로 되돌림(낙관적 갱신 없음). 500은 상세 미노출(security-audit 4) |
| 경계 간 전파 | domain: 반환값 유니온(`TransitionResult { ok:false, code }`) — 던지지 않음. services: domain의 `ok:false`를 `AppError`로 승격해 던짐. infra: DB 예외 → `AppError`. api: `AppError` → 봉투, 그 외 → 500 + `logger.error`. 클라이언트 재시도는 5xx·네트워크·타임아웃만(DECISIONS #24) |
| 동시성 충돌 | `STATE_CHANGED`(409): 관리자 2명이 같은 카드를 조작 → 두 번째는 실패 토스트 + Realtime으로 최신 상태 수신. 재시도 없음(사용자가 다시 판단) |

## 관측성

모든 행에 결정 또는 명시적 "해당 없음 — 사유"를 적는다.

| 항목 | 결정 |
|---|---|
| 로깅 | `src/lib/logger.ts`: JSON 1줄 → stdout(Cloudflare Workers 로그/관측성에서 확인). 필드: `level, event, requestId, route, orderId?, pickupNumber?, code?, durationMs`. **허용 필드 화이트리스트만 직렬화**, 키 이름에 `phone`이 포함되면 `[redacted]`(N-17 로그 평문 0건 — 단위 테스트). 이벤트 목록: `order.created`, `order.idempotent_replay`, `order.rate_limited`(warn, `keyPrefix` 해시 앞 8자 — IP 원문 금지), `order.transition`, `order.sweep`, `settings.updated`(키 목록만, 값 금지 — 계좌번호 로그 방지), `settings.transfer.missing`(warn), `api.error`. 로그에 `status_token`·`idempotency_key` 전체 금지(앞 8자만). 브라우저 `console.*`는 개발 모드만 |
| 에러 추적 / 모니터링 | 없음 — 비용 0·2일 운영. 대체: Cloudflare Workers 로그/관측성(보존 짧음 — 추정, 축제 당일 관리자 1명이 "Logs" 탭 확인 절차 T-30) + `ConnectionBanner`(F-31) + `GET /api/health` |
| 메트릭 | MVP에서는 없음. 대체: `GET /api/admin/stats`의 상태별 건수(`totals`)가 운영 지표(만료·취소 급증 감지). 성능 p95는 2차 T-29 k6 1회 측정으로 갈음 |

## 보안 체크 (security-audit 스킬 적용 결과 요약)

| 항목 | 결정 |
|---|---|
| 시크릿 | `SUPABASE_SERVICE_ROLE_KEY`·(2차)`PHONE_ENCRYPTION_KEY`는 서버 전용, `NEXT_PUBLIC_` 금지. ESLint `no-restricted-imports`로 `infra/supabase/server.ts`를 클라이언트 컴포넌트(`'use client'`)에서 import 금지(T-01 설정). 계좌 정보는 DB(ADR-0004), 리포지토리 0건 — 리뷰 시 `grep`로 확인 |
| 주입 | SQL은 Postgres 함수 파라미터·supabase-js 빌더만(문자열 조립 금지). XSS: React 기본 이스케이프, `dangerouslySetInnerHTML` 금지. CSV: 셀이 `= + - @`로 시작하면 `'` 접두(스프레드시트 수식 주입 방지) |
| 인증·인가 | 관리자 API 전부 `requireAdmin()`. 고객 API는 토큰(256비트) = 인가. 토큰은 URL에 있으므로 `Referrer-Policy: no-referrer`(외부 송금 링크 클릭 시 토큰 유출 방지)를 `next.config` 헤더로 설정, 송금 링크 `<a rel="noopener noreferrer" target="_blank">`. IDOR: 고객은 `id`가 아니라 토큰으로만 조회 |
| 입력 검증 | 모든 핸들러 zod `strict()` — 모르는 필드(예: `price`) 거부(N-03). 수량 1..99, 항목 1..20, 사유 1..200자 |
| 남용 | `POST /api/orders` IP당 분당 100건(초기값), 초과 429 `RATE_LIMITED`(F-47). 카운터는 Postgres `rate_limits` + `consume_rate_limit`(서버리스 인스턴스 무관), 키는 IP sha256(원문 미저장), 멱등 재요청 제외, 관리자 API 제외 — ADR-0009. NAT 공유 IP 오차단은 PRD Open Question #39(한도는 `domain/order/rateLimit.ts` 상수 한 곳) |

## 주요 결정

결정 기록은 [DECISIONS.md](DECISIONS.md)와 [adr/](adr/)에 있다. 이 문서에는 결과만 반영한다.

| ADR | 제목 |
|---|---|
| [0001](adr/0001-data-access-path.md) | 데이터 접근 경로 — Route Handler 경유 통일 |
| [0002](adr/0002-order-creation-transaction.md) | 주문 생성 트랜잭션·멱등키·재고 차감 — Postgres 함수 |
| [0003](adr/0003-admin-realtime.md) | 관리자 실시간 — Realtime + 폴링 폴백 |
| [0004](adr/0004-settings-storage.md) | 설정값 — `app_settings` 테이블 |
| [0005](adr/0005-i18n.md) | 다국어 — 자체 사전 + 번역 테이블 |
| [0006](adr/0006-scheduled-transitions.md) | 시간 기반 전환 — pg_cron + 대시보드 스윕 |
| [0007](adr/0007-test-db-isolation.md) | 테스트 DB — Supabase CLI 로컬 |
| [0008](adr/0008-phone-encryption.md) | 전화번호 암호화(2차) — 앱 계층 AES-256-GCM |
| [0009](adr/0009-order-rate-limit.md) | 주문 생성 속도 제한 — Postgres 테이블 카운터 |
