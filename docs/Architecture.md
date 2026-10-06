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
│  │  │     ├─ page.tsx             #   /admin        주문 대시보드 + 설정·매출 통계 탭(CSV 포함)
│  │  │     └─ menus/page.tsx       #   /admin/menus  메뉴·재고 관리
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
| `create_manual_order` (`0104_manual_orders.sql`) | `(p_idempotency_key uuid, p_payment_method payment_method, p_manual_ordered_at timestamptz, p_manual_number integer, p_actor_id uuid, p_items jsonb) RETURNS jsonb` — T-28 수기 주문 사후 입력(F-34, DECISIONS #62). 완료 상태 주문(`source='manual'`·`manual_ordered_at`·`manual_number`) + 상태 이력(`manual_create`, admin) + 재고 차감을 한 트랜잭션으로. 재고는 `greatest(stock - 수량, 0)`(모자라도 저장), 가격은 DB 값, 비활성 메뉴·옵션 허용. 같은 멱등키 재요청은 기존 주문 반환(`created=false`). `pickup_number`는 고객 번호와 겹치지 않게 `2100000000 + manual_number` | `MANUAL_NUMBER_TAKEN` (detail: manualNumber) · `MENU_UNAVAILABLE` · `INVALID_OPTION` · `INVALID_MANUAL_ORDERED_AT`(미래) · `INVALID_MANUAL_NUMBER` · `EMPTY_ITEMS` · `INVALID_ITEMS` · `IDEMPOTENCY_KEY_CONFLICT`(고객 주문의 키) |
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
| 0016 | `0016_get_stats.sql` | `get_stats` 매출·메뉴 판매율 집계 | T-21 · DB2 | 0012 | `dev` 병합, 운영 적용(DB1, 2026-10-01 확인 — DECISIONS #47) |
| 0017 | `0017_count_waiting_before.sql` | `count_waiting_before` 대기인원 집계 함수 | T-11 · BE2 | 0001 | `dev` 병합(#61), 운영 적용(팀장, 2026-10-01 SQL Editor — 권한·설정 확인 완료). 적용 이력 표(`supabase_migrations.schema_migrations`)에는 없으므로 DB1의 다음 `supabase db push`가 한 번 더 실행하고 기록한다(`CREATE OR REPLACE`·`REVOKE`·`GRANT`라 재실행 무해) |
| 0018 | `0018_rate_limit.sql` | `rate_limits` + `consume_rate_limit` | T-51 · DB1 | 0001 | `dev` 병합(#62). 기존 0014에서 재번호 부여(DECISIONS #45); 운영 적용 여부는 마이그레이션 이력 확인 필요 |
| 0019 | `0019_pg_cron.sql`(선택) | 1분 주기 스윕 스케줄 | T-18·T-19 · DB2 | 0012·0018 운영 적용 후 | #52에서 분리한 Draft PR #82 · 운영 미적용 |
| 01xx | 2차 스키마 | 2차 확장(4절) | 각 2차 작업 | 1차 전부 | — |
| 0100 | `0100_shifts.sql` | 교대 스케줄 `shifts` 및 RLS | T-46 · DB1 | 0019(운영 적용 순서) | 신규 배정. 0018·0019 이후 운영 적용 |
| 0101 | `0101_menu_recommendation.sql` | 메뉴별 추천 여부 `is_recommended` | T-38 · DB1 | 0100(운영 적용 순서) | 신규 배정. 기본값 false, NOT NULL; 기존 메뉴 RLS 유지 |
| 0102 | `0102_reviews.sql` | 후기 테이블·제약·RLS·완료 주문 검사 | T-41 · DB1 | 0101(운영 적용 순서) | 신규 배정. 저장 API는 아래 고객 API 규격, 고객 폼 연결은 후속 |
| 0104 | `0104_manual_orders.sql` | 수기 주문 사후 입력: `orders.source`·`manual_ordered_at`·`manual_number`, `create_manual_order`, `get_stats` 날짜 기준 변경 | T-28 · BE1 | 0103(운영 적용 순서) | 신규 배정(DECISIONS #62). 운영 DB는 0103까지 적용(2026-10-06 팀장 확인) — 병합 후 DB1 적용 |

> **운영 DB 적용 현황(마지막 확인 2026-10-01)**: `0001`·`0003`·`0007`~`0013`·`0016`·`0017` 적용(`0016`은 DB1 서동혁이 `supabase db push`, `0017`은 팀장이 SQL Editor로 — 이력 표에는 다음 `db push` 때 기록). `seed.sql` 운영 적용 완료(10-01 — 메뉴 4·초기 재고 100×4·번역 8·설정 6, DECISIONS #50, T-36). `0018`은 dev에 병합됐으나 운영 적용 여부는 재확인이 필요하다. `0019` 적용 전 운영 마이그레이션 이력에서 `0018` 적용을 확인한다. 기존 `0014`·`0015`는 규칙 4에 따라 `0018`·`0019`로 이름을 바꿨다(DECISIONS #45). 위 표의 현황 열은 2026-09-25 기준이다.

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
| F-34 수기 입력 | `orders.source text NOT NULL DEFAULT 'customer'` (`'customer'|'manual'`), `orders.manual_ordered_at timestamptz`(종이 주문 시각 — 매출·통계·CSV 날짜 기준), `orders.manual_number integer UNIQUE CHECK 1..9999`(종이의 M 번호 — 직접 입력, 축제 전체 연속, 화면·CSV는 `M-001` 표시) — `0104_manual_orders.sql`. 수기 주문만 두 칸을 가진다(CHECK). 기존 `pickup_number` 규칙·고객 카운터는 그대로(수기 주문은 `2100000000 + manual_number`) | T-28 |
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
| `GET /api/menu?lang=ko` | `lang` ∈ SUPPORTED_LOCALES(기본 ko) | `MenuResponse { items: MenuItemDto[], waitingCount: number, locale }` · `MenuItemDto { id, name, description, price, stock, isAvailable, isSoldOut, imageUrl, optionGroups: [{ id, name, minSelect, maxSelect, options: [{ id, name, extraPrice }] }] }` | `is_active` 메뉴만. `isSoldOut = is_sold_out_manual OR stock=0`, `isAvailable = !isSoldOut`. 이름은 요청 언어 → ko 폴백(공백뿐인 번역은 누락으로 봄), 설명은 요청 언어 → ko → `null`. ko 이름이 없는 메뉴·그룹·옵션은 제외(`create_order`가 거부하므로 — 필수 그룹이 이렇게 빠지면 그 메뉴는 주문할 수 없으니 seed 적용 후 점검, 배포 절 "DB·상태 마이그레이션"). 비활성 옵션·그룹 제외, 활성 옵션이 0개인 활성 그룹은 `options: []`로 둔다(화면이 `minSelect`로 담기 가능 여부 판단). 정렬은 `sort_order` → `id`. 허용 외 `lang`(빈 값 포함)은 400, 응답 `locale`은 요청 언어. `waitingCount` = 전체 미완료 수(F-11 메뉴판, `count_waiting_before(NULL)` — `/api/queue`와 같은 정의). 200 응답 `Cache-Control: no-store` |
| `GET /api/queue` | — | `{ waitingCount }` | 메뉴판 주기 갱신(30초)용. 200 응답 `Cache-Control: no-store` |
| `GET /api/settings/transfer` | — | `TransferSettingsDto { configured: boolean, bankName, accountNumber, accountHolder }` | `transfer.*` 키만(계좌 정보 3개). 빈값은 `''`. `configured` = 은행 3값 모두 비어있지 않음. 비어 있으면 서버 `warn` 로그(F-44) |
| `POST /api/orders` | `CreateOrderRequest { idempotencyKey: uuid, paymentMethod: 'cash'|'transfer' (transfer = 계좌이체), locale, items: [{ menuItemId: uuid, quantity: int 1..99, optionIds: uuid[] }] (1..20개) }` — 가격 필드 없음 — `totalAmount`, `price` 등 요청 규격에 없는 필드가 포함되면 Zod `strict()`로 400 `VALIDATION_ERROR`, 주문·항목 생성 및 재고 차감 없음(2026-09-26 팀장 결정, GitHub #45) | 201 신규 / 200 멱등 재요청: `CreateOrderResponse { orderId, pickupNumber, statusToken, status, totalAmount, createdAt, created: boolean }` | `paymentMethod` 누락·허용 외 값 → 400. 멱등키 기존 주문이면 속도 제한 미소비로 200. 신규면 `consume_rate_limit` → 초과 시 429 `RATE_LIMITED`(ADR-0009). 이후 ADR-0002 함수. 에러 409 OUT_OF_STOCK 등 |
| `GET /api/orders/{token}` | 경로 토큰 64 hex | `OrderStatusDto { orderId, pickupNumber, status, paymentMethod, totalAmount, items: [{ name, quantity, options: string[], lineTotal }], createdAt, transferReportedAt, cancelRequestedAt, cancelRejectedAt, aheadCount, canTransferReport, canCancelRequest }` | 토큰 형식 불일치·미존재 모두 404. `aheadCount` = `count_waiting_before(created_at)`. `name`/`options`는 주문 시 `locale` 기준 스냅샷(ko 폴백). 시각 4개는 ISO UTC `…Z`(밀리초)로 응답하고 대기 수 계산에는 DB 원본(µs)을 쓴다. 클라이언트 5초 폴링. 200 응답 `Cache-Control: private, no-store` |
| `POST /api/orders/{token}/transfer-report` | 본문 없음 | `{ transferReportedAt }` | `status='pending' AND payment_method='transfer'`가 아니면(현금 주문 포함) 409 `INVALID_TRANSITION`. 이미 신고됨이면 기존 시각 그대로 200(멱등, F-43) |
| `POST /api/orders/{token}/cancel-request` | 본문 없음 | `{ cancelRequestedAt }` | `status ∈ {pending,paid}` 아님 또는 `cancel_rejected_at` 있음 → 409 `CANCEL_REQUEST_NOT_ALLOWED`. 이미 요청됨이면 기존 시각 200(멱등, F-45) |
| `POST /api/orders/{token}/reviews` | `{ rating: int 1..5, text?: string \| null }` — 텍스트 선택·Unicode code point 200자 이하, 추가 필드 거부 | 201 `{ createdAt }`(ISO 8601 UTC) | T-41·F-37. 토큰 조회로 주문 식별(본문 주문 ID 불허), 완료 외 409 `REVIEW_NOT_ALLOWED`, 중복 409 `REVIEW_ALREADY_SUBMITTED`. 형식 오류·미존재 토큰 404 `NOT_FOUND`. 입력 오류 400 `VALIDATION_ERROR`(자유 입력 보호를 위해 `details` 생략). 기존 `0102_reviews.sql` 트리거·PK로 상태 변경·동시 제출 경합 차단. 성공·오류 모두 `Cache-Control: private, no-store` |

### 7. 관리자 API (전부 `requireAdmin()` — 세션 없으면 401)

T-46 교대 스케줄: `GET /api/admin/shifts` → `{ shifts: Shift[] }`(날짜·시작·이름·id 오름차순 전체 목록).
`POST /api/admin/shifts` → 201, `PATCH /api/admin/shifts/{id}` → 200: 전체 `ShiftInput { personName, date: YYYY-MM-DD, startsAt: HH:mm, endsAt: HH:mm, role }` 본문, 응답은 `Shift { id, ...ShiftInput }`.
`DELETE /api/admin/shifts/{id}` → 204. 잘못된 날짜·시간·빈 이름/역할·추가 필드·UUID는 400 `VALIDATION_ERROR`, 미존재 수정/삭제는 404. 인증은 모든 검증·저장소 접근보다 먼저 수행한다.

| 메서드·경로 | 요청 | 응답 | 규칙 |
|---|---|---|---|
| `GET /api/admin/orders?date=YYYY-MM-DD&status=&pickupNumber=` | `date` 기본 오늘(KST — 서버 시각 기준). 달력에 없는 날짜면 400 `VALIDATION_ERROR`. `status` 콤마 목록 선택. `pickupNumber` 정수(있으면 date 무시) | `{ orders: AdminOrderDto[], unacknowledgedCount }` — `created_at DESC` | `AdminOrderDto { id, pickupNumber, status, paymentMethod, totalAmount, items: [{ menuNameKo, quantity, options: [{ nameKo, extraPrice }], lineTotal }], createdAt, updatedAt, acknowledgedAt, transferReportedAt, cancelRequestedAt, cancelRejectedAt, paidAt, cookingStartedAt, completedAt, closedAt, refundChannel, lastReason, availableActions: TransitionAction[] }`. F-22: `pickupNumber` 결과 0건이면 `orders: []` |
| `GET /api/admin/orders/{id}` | — | `AdminOrderDto` | Realtime INSERT 하이드레이션용 |
| `POST /api/admin/orders/{id}/acknowledge` | — | `AdminOrderDto` | 이미 확인됨이면 그대로 200 |
| `POST /api/admin/orders/{id}/transition` | `{ action: 'confirm_payment'|'confirm_cash'|'start_cooking'|'complete'|'cancel'|'refund', reason?: string(1..200), refundChannel?: RefundChannel }` | `AdminOrderDto` | 상태 머신 절. `actor_type='admin', actor_id=user.id` |
| `POST /api/admin/orders/{id}/cancel-request` | `{ decision: 'approve'|'reject', reason: string(1..200) }` | `AdminOrderDto` | approve = `transition(action='cancel', reason)`; reject = `cancel_rejected_at` 설정 + 이력(`cancel_request_reject`). `cancel_requested_at` 없으면 409 `INVALID_TRANSITION` — 이미 거절된 요청(`cancel_rejected_at` 있음)·결제대기/결제확인이 아닌 주문도 409. `reason` 빈 문자열 400 `VALIDATION_ERROR`, 공백만 400 `REASON_REQUIRED`(승인·거절 모두 사유 필수) |
| `GET /api/admin/menus` | — | `{ menus: AdminMenuDto[] }` · `AdminMenuDto { id, translations: { [locale]: { name, description } }, basePrice, stock, isSoldOutManual, isActive, sortOrder, imageUrl, optionGroups: [{ id, translations, minSelect, maxSelect, isActive, options: [{ id, translations, extraPrice, isActive }] }] }` | 비활성 포함(1차 UI는 수정만) |
| `PATCH /api/admin/menus/{id}` | `{ basePrice?: int≥0, stock?: int≥0, isSoldOutManual?: bool, translations?: { [locale]: { name: string≥1, description?: string } } }` | `AdminMenuDto` | ko `name` 빈값 → 400. 재고 0이면 `isSoldOut` 파생(F-25) — 별도 플래그 저장 없음 |
| `PATCH /api/admin/option-groups/{id}` | `{ translations?, minSelect?, maxSelect?, isActive? }` | `AdminMenuDto`(소속 메뉴) | max ≥ min 아니면 400 |
| `PATCH /api/admin/options/{id}` | `{ translations?, extraPrice?: int≥0, isActive? }` | `AdminMenuDto` | |
| `GET /api/admin/stats?date=YYYY-MM-DD` | `date` 기본 오늘(KST); `date=all` 허용 | `StatsDto { date, sales, orderCount, refundedAmount, refundedCount, byMenu: [{ menuItemId, nameKo, quantity, ratio }], totals: { pending, paid, cooking, completed, cancelled, refunded, expired } }` | DECISIONS #19 규칙. `byMenu`는 status ∈ {paid,cooking,completed} 항목 수량 합, `ratio` = 수량/총수량(0건이면 `[]`). 수기 주문(T-28)은 `manual_ordered_at` 날짜에 넣는다 — 그 밖은 `created_at`(DECISIONS #62, `0104`) |
| `GET /api/admin/stats/csv?from=YYYY-MM-DD&to=YYYY-MM-DD` | 기본 축제 전체(2026-10-07~08 — `app_settings`가 아니라 요청 기본값 상수 `FESTIVAL_DATES`) | `text/csv; charset=utf-8` + BOM, `Content-Disposition: attachment; filename="orders_{from}_{to}.csv"` | 헤더 13개(DECISIONS #20, 2026-09-24 `송금 하위 수단` 삭제): `주문 ID,픽업 번호,주문 시각,메뉴,옵션,수량,금액,결제수단,상태,취소/환불 사유,주문 합계,결제확인 시각,완료 시각`. 옵션은 `;`로 연결. 상태·결제수단은 한글 라벨. 0건이면 헤더만. 수기 주문(T-28)은 `manual_ordered_at` 날짜에 넣는다 — 그 밖은 `created_at`(DECISIONS #62, `0104`) |
| `GET /api/admin/settings` | — | `{ settings: { [key]: string } }` | 전체 키 |
| `PUT /api/admin/settings` | `{ settings: { [key]: string } }` (ADR-0004 키만, 키별 zod: `payment.expire_minutes` int 1..120, `auto_complete.enabled` `'true'|'false'`, `auto_complete.minutes` int 1..120, `transfer.*` string ≤200) | `{ settings }` (전체 키) | 부분 갱신 — 전달된 키만 upsert, 나머지 유지. 알 수 없는 키 400(`VALIDATION_ERROR`, `details`에 키). `transfer.*`는 빈 문자열 허용(= "미입력"). `updated_by = user.id`. F-48 설정 패널의 저장 경로 |
| `POST /api/admin/sweep` | — | `{ expired, completed }` | ADR-0006 폴백. 멱등 |
| `POST /api/admin/manual-orders` | `{ idempotencyKey: uuid, paymentMethod: 'cash'|'transfer', manualOrderedAt: ISO 8601(오프셋 필수), manualNumber: int 1..9999, items: [{ menuItemId, quantity: int 1..99, optionIds: uuid[] }] (1..20) }` — strict, 가격 필드 없음 | 201 신규 / 200 같은 멱등키 재요청 · `ManualOrderResponse { orderId, manualNumber, displayNumber: 'M-001', status: 'completed', paymentMethod, totalAmount, manualOrderedAt, createdAt, created, stockShortages: [{ menuItemId, requested, available }] }` | T-28(F-34, DECISIONS #62). 같은 수기 번호의 다른 요청 → 409 `MANUAL_NUMBER_TAKEN`. 없는 메뉴 409 `MENU_UNAVAILABLE`, 옵션 오류 409 `INVALID_OPTION`, 미래 시각·형식 오류 400 `VALIDATION_ERROR`. 재고 부족은 오류가 아니다(`stockShortages`로 알림, 재고는 0에서 멈춤). `AdminOrderDto`에 `source`·`manualNumber`·`manualOrderedAt` 추가(선택 필드) |

### 8. 화면 메커니즘 (PRD "화면" 절 실현)

라우팅·상태 소유·컴포넌트 경계. 시각 완성도는 디자인 재량(PRD #3).

| 화면 | 경로 | 상태 소유자(훅) | 데이터 원천·갱신 | 빈 값·로딩·에러 처리 위치 |
|---|---|---|---|---|
| 고객 메뉴판 | `/` | `useMenu(locale)` — `{ status: 'loading'|'ready'|'error', items, waitingCount, reload }` | `GET /api/menu` 마운트 시 + `GET /api/queue` 30초 | 로딩: `MenuSkeleton`; 에러: `ErrorRetry`(reload); 빈 값: `isAvailable` 메뉴 0개 → `EmptyState('menu.empty')`; 품절: `MenuCard disabled` + 라벨. 검색(팀장 결정 2026-10-01): 이미 받은 목록을 이름·설명으로 거름(공백·대소문자 무시), 0건 → "검색 결과가 없습니다". 언어: `layout.tsx`가 쿠키/쿼리로 결정해 `LocaleProvider`로 하위 전달 |
| 메뉴 상세(옵션·수량) | `/`의 `MenuDetailSheet`(모달, 라우트 없음) | `useCart`(zustand) `addItem` | 클라이언트 | 수량 상한 = `stock`(F-02) — `QuantityStepper max`. 옵션 min/max 미충족 시 담기 비활성. 필수 그룹(`minSelect ≥ 1`)의 선택지가 `minSelect`보다 적으면 담기 비활성 + 이유 문구(팀장 결정 7, 2026-10-01) |
| 장바구니 | `/cart` | `useCart` — `items, total(=domain/pricing), update, remove, clear` + `useMenu`로 품절 재검사 | sessionStorage + 마운트 시 `GET /api/menu` | 빈 값: `EmptyCart` + 메뉴판 링크, 주문 버튼 비활성; 담은 메뉴가 품절/비활성 → 항목 경고 + 진행 차단 |
| 결제수단 선택/확정 | `/checkout` | `useCheckout` — `{ paymentMethod, idempotencyKey, submitting, error, submit }` | `POST /api/orders` (재시도 DECISIONS #24) | 미선택 → 확정 비활성; P1은 현금만 — 계좌이체는 "(준비 중)"으로 비활성(`features/customer/paymentMethods.ts`, T-31 계좌 안내 때 다시 켬); `submitting` 중 버튼 잠금; `OUT_OF_STOCK` → `details`로 항목 표시 + `/cart` 복귀; 네트워크 실패 → 수동 재시도 버튼(장바구니 유지); `RATE_LIMITED`(429) → `errors.RATE_LIMITED` 문구("잠시 후 다시 시도") + 같은 수동 재시도 버튼 + 장바구니·멱등키 유지(F-47); 성공 → cart·key 폐기 후 `/orders/{token}?new=1` |
| 주문 완료/상태 | `/orders/[token]` | `useOrderStatus(token)` — `{ status:'loading'|'ready'|'notFound'|'error', order, refreshFailed, retry }`(P2에서 `actions` 추가) | `GET /api/orders/{token}` 5초 폴링(완료·취소·환불·만료·404면 중지) + (P2) `GET /api/settings/transfer`(계좌이체 주문만, 1회) | `?new=1`이면 완료 보기(`OrderCompleteCard`) 먼저, "주문 현황 보기"로 전환; 404 → `NotFound('order.notFound')`; 로딩 표시; 주문을 받은 뒤 갱신 실패 → 픽업 번호 유지 + 안내(`refreshFailed`); (P2) `TransferGuide`(계좌이체 안내 — 은행명·계좌번호·예금주·금액 + 복사 버튼 + 입금자명=픽업 번호 안내, 설정 빈값 → "준비 중"); (P2) `[송금했어요]`/`[취소 요청]` 버튼은 `canTransferReport`/`canCancelRequest`; 클릭 중 잠금, 실패 토스트; 거절됨 문구 `cancelRejectedAt` |
| 개인정보 고지 | `/privacy` | 없음(정적) | `messages` | 없음 — 정적. 고객 레이아웃 푸터 링크(1탭) |
| 관리자 로그인 | `/admin/login` | 로컬 폼 상태 | `supabase.auth.signInWithPassword`(브라우저 클라이언트) → 성공 시 `/admin` | 빈칸 → 제출 비활성; 오류 메시지 표시. 회원가입 링크 없음 |
| 대시보드 | `/admin` | `useOrdersFeed`(Map 병합, ADR-0003) + `useConnectionMonitor` + `useSettings` | Realtime + `/api/admin/orders` + 30초 `sweep` | 빈 값: "아직 주문이 없습니다"; 초기 로딩; `ConnectionBanner`(10초); 전환 실패 → 토스트 + 서버 응답으로 카드 되돌림(낙관적 갱신 안 함 — 서버 응답 후 갱신); 미확인 강조 = `acknowledgedAt==null`; 송금 신고·취소 요청 배지; `PickupSearch`는 Map 필터(클라이언트) — 오늘 범위 밖 번호면 `GET ?pickupNumber=`; `SettingsPanel`(F-48 — 아래 "설정 패널" 단락) |
| 메뉴·재고 관리 | `/admin/menus` | `useMenuAdmin` — 목록 + 항목별 편집 폼 상태 | `GET/PATCH /api/admin/menus…` | 빈 값: "메뉴가 없습니다 — 시드 데이터를 확인하세요"; 저장 중 잠금; 유효성(가격·재고 음수, ko 이름 빈칸) 즉시 표시; 실패 토스트 |
| 통계 | `/admin` 내부 매출 통계 탭 | `StatsPanel`의 날짜·조회 상태 | `GET /api/admin/stats`, CSV는 `<a href>` 다운로드 | 빈 값: "데이터 없음"(차트 미렌더); 로딩; 에러 + 재시도. `/admin/stats` 별도 페이지는 두지 않음 |
| 교대 스케줄 (T-46, F-40) | `/admin/shifts` (`admin/(protected)/shifts/page.tsx`) | `features/admin/ShiftManagement` — CRUD 폼·목록·현재 담당자. 현재 시각은 30초마다 갱신, KST 구간 [시작, 종료)로 복수 담당자 산출 | `lib/api/client` → 관리자 shifts API | 0건·현재 담당자 없음·조회 로딩/오류 재시도·저장 잠금/실패 안내·삭제 확인. 오류 상태를 0건으로 표시하지 않음. 세션 없음/만료 → 로그인 |
| (2차) 수기 입력·프로모션 | `/admin/manual-orders`, 고객 `/promotions` 또는 배너 | 착수 시 정의 | — | 세부 미정(#28~#31) 확정 후 팀장 갱신. 2026-10-05: 수기 입력(T-28)은 축제 포함 — 재고 부족 시 저장·재고 0에서 멈춤, 매출 날짜는 `orders.manual_ordered_at` 기준(DECISIONS #62, PRD F-34). 저장 API 요청·응답 계약은 위 관리자 API 표 `POST /api/admin/manual-orders`(2026-10-06 — 수기 번호는 종이의 M 번호를 직접 입력, 중복은 DB가 거부). 프로모션(F-38)은 미구현 |

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

관리자 라우트 보호: `src/app/admin/(protected)/layout.tsx`(서버 컴포넌트)에서 `@supabase/ssr` 세션 클라이언트로 `getUser()` → 없으면 `redirect('/admin/login')`. 추가로 `src/proxy.ts`(Next.js 16 proxy — 옛 `middleware.ts`)가 matcher `/admin/:path*`(로그인 화면 포함)에서 세션 쿠키를 갱신하고(`@supabase/ssr` 권장 패턴), 비로그인 `/admin/*` → `/admin/login`, 로그인 상태 `/admin/login` → `/admin`으로 보낸다. 두 redirect 모두 `getUser()`가 갱신·삭제한 세션 쿠키를 redirect 응답에 옮겨 싣는다. 관리자 로그아웃은 `signOut({ scope: 'local' })`로 이 기기 세션만 끝낸다(DECISIONS #48). API는 각 핸들러의 `requireAdmin()`이 최종 판정(레이아웃 가드는 UX용).

### 계층 규칙 (DB·외부 API가 있는 프로젝트만 — 없으면 "해당 없음" 기재)

기준은 [docs/guides/clean-architecture.md](guides/clean-architecture.md). 이 프로젝트에 적용할 결정만 아래에 적는다.

| 항목 | 결정 |
|---|---|
| 의존성 방향 | `domain` ← `services` ← `infra/repositories`·`app/api`·`features` ← `app/(pages)`. `domain`은 어떤 것도 import하지 않는다(zod 포함 — 타입만). `services`는 `ports.ts`와 `domain`만 import. `next/*`·`@supabase/*`는 `infra`와 `app`에서만 |
| Repository 포트 | `src/services/ports.ts`에 TS 인터페이스: `OrderRepository { createOrder(input): Promise<CreateOrderResult>; findByToken(token); findById(id); transition(...); setTransferReported(id); setCancelRequested(id); rejectCancelRequest(id, actorId, reason); acknowledge(id, actorId); list(filter); countWaitingBefore(createdAt?) }`, `MenuRepository`, `SettingsRepository`, `RateLimitRepository { consume(scope: string, key: string, limit: number, windowSeconds: number, now?: Date): Promise<boolean> }`(ADR-0009), `Clock { now(): Date }`. `OrderRepository`에 `findByIdempotencyKey(key)` 포함. 구현체는 `src/infra/repositories/supabase*.ts`. 주입은 함수 인자 기본값(`createOrder(dto, deps = defaultDeps())`) — DI 컨테이너 없음 |
| DTO ↔ 도메인 변환 위치 | 요청: Route Handler에서 zod parse → 서비스에 DTO 타입 전달. 응답: DB 행 → 포트 타입 변환은 `src/infra/repositories/mappers.ts`(`toAdminOrderDto`, `toOrderByTokenResult`, `toMenuItemRecord`), 폴백·거르기·시각 표기처럼 규칙이 있는 응답 DTO 조립은 서비스(`getOrderByToken`, `getMenu`) — DB 행을 API로 직접 반환 금지(스프레드 금지, 필드 명시 나열 — 2차 `phone_encrypted` 누출 방지) |
| 순환 의존성 | 금지. `features` ↔ `components` 사이도 단방향(features가 components를 렌더, components는 features를 모른다). ESLint `import/no-cycle` + `no-restricted-imports`(`domain`·`services`에서 `next`, `@supabase` 금지)를 T-01에 설정 |

## 테스트 전략

케이스 도출·부실 테스트 방지 기준은 TDD 원칙을 따른다 (정상 1 + 경계 2 + 예외 2 이상, 실제 값 단언, 비동기 대기, 외부 의존성 격리). 아래에는 이 프로젝트의 선택만 적는다.

| 항목 | 결정 |
|---|---|
| 테스트 프레임워크 | 단위·통합: **Vitest** (+ `@testing-library/react`, `jsdom` 환경은 컴포넌트 테스트 파일에만 `// @vitest-environment jsdom`). E2E: **Playwright** (chromium, 고객 화면은 `devices['Pixel 7']`·`devices['iPhone 14']` 프로젝트 2개, 관리자는 데스크톱 chromium). 부하: k6 (2차 T-29, `tests/load/order-create.js`) |
| 테스트 디렉토리 배치 | `tests/unit/**/*.test.ts(x)` (DB 불필요, ports mock) · `tests/integration/**/*.test.ts` (로컬 Supabase 필수, 파일 직렬) · `tests/e2e/**/*.spec.ts`. 소스 옆 co-location 금지(6명 병렬 시 위치 규칙 하나로) |
| 커버 범위 기준 | N-13 목록을 최소 필수로: 가격 재계산·옵션 추가 가격·멱등키·재고 차감·연속 픽업 번호(통합), 재고 복구·환불(통합), 자동 만료 경계 + 송금 신고 제외(통합, `p_now` 주입), 송금 신고·취소 요청 멱등(통합), 대기 수(통합), 토큰 검증(통합), 상태 머신 표 전수(단위 — 7상태 × 8action 매트릭스, 불허가 409인지), 장바구니 합계·수량 경계(단위), 번역 폴백(단위), 피드 병합·연결 감시 타이머(단위, fake timers), CSV 헤더·합계 일치(단위). 속도 제한(F-47, T-51): `consume_rate_limit` 100회 `true`·101회째 `false`·`p_now`+60초 `true`(통합), 같은 멱등키 재요청 시 카운트 불변(통합), `getClientIp` 헤더 우선순위·없음→`'unknown'`(단위). 설정 패널(F-48, T-52): 키별 zod 범위(단위), `PUT` 부분 갱신·알 수 없는 키 400(통합). E2E 1개(T-24 시나리오). 수치 커버리지 임계값은 두지 않는다(요구 없음) |
| Mock/Stub 대상 (외부 의존성) | 단위: `ports.ts` 인터페이스를 in-memory 구현(`tests/unit/fakes/*.ts`)으로 대체, `Clock`은 고정 시각. 시간은 `vi.useFakeTimers()`. 통합: mock 없음 — 로컬 Supabase 실물(ADR-0007). 동작을 바꾸는 mock(예: `requireAdmin`) 금지, import 차단 해제용 `server-only` 스텁만 허용 — Route Handler·인증 경계는 단위, 로그인 포함 흐름은 E2E(DECISIONS #46). E2E: 로컬 Supabase + `next dev`, 관리자 계정은 셋업에서 로컬 Auth Admin API로 생성. 외부 은행 앱은 테스트하지 않음(간편결제는 2026-09-24 제외) |
| T-01 스모크 범위 | (1) `tests/unit/smoke.test.ts` — `domain/i18n/locales.ts`의 `DEFAULT_LOCALE === 'ko'` 단언(도메인 모듈 import 경로 검증) (2) `tests/e2e/smoke.spec.ts` — `/` 접속 시 `<html lang>` 존재 + 200. (3) `npm run build` 성공. (4) CodingRules "검증된 명령어"에 `npm run dev` / `npm run build` / `npm run test` / `npm run test:e2e` / `npx supabase start` 원문 등록. (5) `.github/workflows/ci.yml` 생성 + 첫 push에서 녹색 확인(아래 CI 행). 통합 테스트 명령(`npm run test:integration`)은 T-02(로컬 Supabase 연결)에서 등록 |
| CI | **GitHub Actions 도입**(PRD Open Question #34 — 승인, DECISIONS #34). 파일 `.github/workflows/ci.yml`, 소유는 소스 코드(BE2). 트리거: 모든 브랜치 `push` + `dev`·`main` 대상 `pull_request`. 잡 ① `unit-build`(T-01): `ubuntu-latest`, `actions/setup-node` Node 20 + npm 캐시, `npm ci` → `npm run lint` → `npm run test` → `npm run build`(빌드용 `NEXT_PUBLIC_SUPABASE_URL`·`ANON_KEY`는 더미 값 — 빌드는 DB에 접속하지 않는다). 잡 ② `integration`(T-02에서 추가): `supabase/setup-cli` → `supabase start` → `npm run test:integration` → `supabase stop`. 로컬 스택 고정 키는 `supabase status -o env`로 잡 안에서 읽는다(GitHub Secrets 불필요 — 시크릿 0개). E2E는 CI 미포함 — Playwright 브라우저 설치·`next dev` 기동 비용 대비 E2E 1개(요구 없음, T-24 로컬 실행). 병합 게이트: DoD의 "테스트 통과"는 CI 녹색으로 증빙(수동 실행 출력 대체 가능) |
| 통합·E2E 로컬 실행 지침 (Docker) | PRD Open Question #38 운영 지침: **팀원 전원 Docker Desktop 설치 불가 판정(2026-09-22 팀장 지시)**. 로컬에서는 단위 테스트 위주로 실행하고, 통합 테스트는 GitHub Actions CI 잡 ②(`supabase start` 기반)에 맡긴다(ADR-0007 규격 유지). 검증 전환 요청에 첨부하는 통합 테스트 근거는 CI 실행 링크로 갈음한다 |

## 배포

docs/PRD.md의 "배포·운영" 항목이 요구사항이라면, 여기는 그 요구사항을 어떻게 실현하는지 메커니즘을 적는다. 모든 행에 결정 또는 명시적 "해당 없음 — 사유"를 적는다 — 빈칸 금지.

| 항목 | 결정 |
|---|---|
| 호스팅 / 실행 대상 | **Cloudflare Workers Free + Supabase Free** 프로젝트 1개(프로덕션). T-50(2026-09-23) 검증 결과 비용 0원 방침에 따라 Vercel Hobby를 사용하지 않고 Cloudflare Workers Free로 전환 확정. 배포 어댑터는 OpenNext(`@opennextjs/cloudflare`, devDependencies 고정)로 확정(DECISIONS #52, 2026-10-01 — 이전 판의 "vinext 우선 검증"을 개정). `next build` 결과를 Worker로 변환하며 CI unit-build가 Worker 번들 생성을 확인한다. 빌드 Node는 `.nvmrc`(22, DECISIONS #51). 도메인은 구매하지 않고 `{worker}.{account-subdomain}.workers.dev` 사용(N-14). Worker 이름과 account subdomain은 T-25에서 확정한 후 QR 인쇄 전 변경 금지. Workers Free 한도는 100,000 requests/day·CPU 10ms/request다. 요청량은 예상 200건/일에 충분하며, 실제 배포 경로와 CPU 제한은 T-25 운영 스모크·운영 URL 검증에서 확인한다. T-29 30 RPS(`next start`, Node.js 서버)는 Workers 런타임·한도를 거치지 않으므로 애플리케이션·Supabase 처리 성능만 검증한다(DECISIONS #57, 2026-10-04 개정). |
| 빌드·릴리스 파이프라인 | Cloudflare Workers Git 연동 기준으로 **`main`을 프로덕션 배포 브랜치로 사용**한다(DECISIONS #53, 2026-10-01 — 이전 `dev`에서 변경). 작업은 `dev`에 병합해 통합·검증하고, `dev` → `main` PR을 병합할 때 운영 주소에 반영된다. 비프로덕션 브랜치 빌드(프리뷰)를 켜면 같은 운영 Supabase를 쓰므로 프리뷰에서 주문을 만들지 않는다. 테스트는 기존 GitHub Actions가 push·PR마다 실행하며, 병합 전 DoD에서 CI 녹색을 요구한다. 배포와 CI가 별도이므로 CI 실패 코드를 `dev`에 직접 push하지 않는다. |
| 환경과 승격 | 로컬(Supabase CLI 로컬 스택) → 프리뷰(Cloudflare 비프로덕션 배포, DB는 프로덕션 Supabase 공유) → 프로덕션(`main`, DECISIONS #53). 스테이징 DB는 두지 않는다. 축제 당일(10-07~08)에는 긴급 장애 수정 외의 `main` 병합(= 운영 배포)·DB 마이그레이션을 금지한다(T-30 동결 규칙 — 긴급 수정은 책임자 승인·최소 스모크 후). |
| 환경별 설정 | Cloudflare Workers에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 **빌드 변수**로(`next build` 때 코드에 박힘), `SUPABASE_SERVICE_ROLE_KEY`, (2차) `PHONE_ENCRYPTION_KEY`는 **실행 Secret**으로 설정한다. 대시보드의 일반 텍스트 실행 변수는 배포(`wrangler deploy`) 때 덮어써져 사라지므로 쓰지 않는다(T-25 가이드 3절, 2026-10-01 첫 배포에서 확인). 로컬 값은 미커밋 파일에서 관리하고 `.env.example`에는 플레이스홀더만 둔다. 송금 정보·운영값은 환경변수가 아니라 `app_settings`에서 관리한다(ADR-0004). |
| DB·상태 마이그레이션 | `supabase/migrations/*.sql`이 원본. 적용: DB1(서동혁, DECISIONS #47)이 `supabase link` 후 `supabase db push`(수동, 배포 전에 먼저). 순서 규칙: 컬럼 추가는 앱 배포 전, 컬럼 삭제는 앱 배포 후. 예외(2026-09-24): T-53의 `orders.transfer_method` 삭제는 이 컬럼을 쓰는 앱 코드가 아직 배포 전(P0)이라 배포 전에 적용 — 이후 삭제는 원칙대로 앱 배포 후. 시드: `supabase db reset`(로컬) / 프로덕션은 `seed.sql`의 멱등 INSERT를 SQL Editor에서 1회 실행(T-36, DB1). seed의 계좌 3개(`transfer.*`)는 빈 값이므로 적용 후 팀장이 Table Editor로 입력한다 — 절차 [T-30](T-30-transfer-settings.md). seed 적용 후 DB1은 메뉴 데이터도 확인한다 — 활성 메뉴의 활성 필수 옵션 그룹 중 ko 이름이 없거나 공백인 것 0건: `SELECT g.id FROM option_groups g JOIN menu_items m ON m.id = g.menu_item_id LEFT JOIN option_group_translations t ON t.option_group_id = g.id AND t.locale = 'ko' WHERE m.is_active AND g.is_active AND g.min_select >= 1 AND (t.name IS NULL OR btrim(t.name) = '')` (메뉴 API는 ko 이름 없는 그룹을 숨기므로, 필수 그룹이 숨겨지면 그 메뉴는 보이지만 주문할 수 없다). |
| 롤백 절차 | 앱: Cloudflare Workers Deployments에서 이전 배포 버전으로 Rollback한다. DB는 되돌리기 마이그레이션 없이 전진 수정(새 마이그레이션)을 원칙으로 한다. 데이터 손상 대비 축제 전 `supabase db dump`로 수동 백업 1회(T-25). |
| 헬스체크 / 스모크 테스트 | `GET /api/health`(DB 왕복 포함). 배포 후 T-25 수동 스모크: 프로덕션 URL에서 메뉴판 로드 → 현금 주문 1건 → 관리자 로그인 → 대시보드 표시 → 현금 수령 확인 → 조리 완료(P1에는 취소 화면 없음). 테스트 주문은 픽업 번호를 소비하므로 축제 전 `counters` 리셋·테스트 주문 삭제·재고 원복을 T-25 마지막 단계로 한다. **2026-10-01 첫 운영 배포(`main` `572a346`)·스모크 통과** — 주소·결과는 [T-25 가이드 7절](T-25-deployment.md). |
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
| 인증·인가 | 관리자 API 전부 `requireAdmin()`. 고객 API는 토큰(256비트) = 인가. 토큰은 URL에 있으므로 `Referrer-Policy: no-referrer`(외부 송금 링크 클릭 시 토큰 유출 방지)를 `next.config` 헤더로 설정(2026-10-02 적용 — `next.config.ts` `headers()` `/:path*`. 예외: proxy의 로그인 리다이렉트 307, Worker를 거치지 않는 `_next/static` 파일 — 둘 다 토큰 없는 URL), 송금 링크 `<a rel="noopener noreferrer" target="_blank">`. IDOR: 고객은 `id`가 아니라 토큰으로만 조회 |
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
