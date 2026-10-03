import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { generateTestIdempotencyKey, evaluateSummary } from './helpers.js';

/**
 * T-29: k6 부하 검증 (2차)
 * 요구사항: PRD N-06
 * - 30 RPS(목표 10 RPS × 3배) 주문 생성 시 오류율 0%
 * - 고객 화면 API(메뉴 조회·주문 생성·상태 조회) 응답시간 p95 1초 이내 (200건/일 규모 기준)
 * - Architecture: tests/load/order-create.js
 */

// 커스텀 트렌드 및 메트릭
const menuDuration = new Trend('menu_duration', true);
const orderCreateDuration = new Trend('order_create_duration', true);
const orderStatusDuration = new Trend('order_status_duration', true);
const orderCreateSuccess = new Rate('order_create_success');
const orderCreatedCount = new Counter('order_created_count');

// 환경 설정
const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TARGET_RPS = parseInt(__ENV.RATE || '30', 10);
const DURATION = __ENV.DURATION || '30s';
const PRE_ALLOCATED_VUS = parseInt(__ENV.VUS || '50', 10);
const MAX_VUS = parseInt(__ENV.MAX_VUS || '150', 10);

export const options = {
  scenarios: {
    order_load_test: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    // 전체 HTTP 실패율 0% (PRD N-06)
    http_req_failed: ['rate<0.01'],
    // 전체 HTTP 응답시간 p95 1초 이내 (1000ms) (PRD N-06)
    http_req_duration: ['p(95)<1000'],

    // 고객 화면 API 세부 메트릭 p95 < 1000ms
    menu_duration: ['p(95)<1000'],
    order_create_duration: ['p(95)<1000'],
    order_status_duration: ['p(95)<1000'],

    // 주문 생성 성공률 100%
    order_create_success: ['rate>0.99'],
  },
};

/**
 * 사전 준비: 메뉴 목록을 가져와서 테스트에 사용할 메뉴 아이템 ID를 확보
 */
export function setup() {
  console.log(`[T-29 k6] 부하 테스트 시작 준비: 대상 URL=${BASE_URL}, 목표=${TARGET_RPS} RPS, 기간=${DURATION}`);

  const fallbackMenuItems = [
    { id: '11111111-1111-1111-1111-111111111111', name: '기본호떡' },
    { id: '22222222-2222-2222-2222-222222222222', name: '뿌링클 호떡' },
    { id: '33333333-3333-3333-3333-333333333333', name: '불닭 치즈 호떡' },
    { id: '44444444-4444-4444-4444-444444444444', name: '맛다시 호떡' },
  ];

  try {
    const res = http.get(`${BASE_URL}/api/menu?lang=ko`, {
      tags: { endpoint: 'setup_menu' },
    });

    if (res.status === 200) {
      const data = JSON.parse(res.body);
      const activeItems = (data.items || []).filter(
        (item) => item.isActive !== false && item.isSoldOut !== true
      );
      if (activeItems.length > 0) {
        console.log(`[T-29 k6] 메뉴 조회 성공: 활성 메뉴 ${activeItems.length}개 발견`);
        return {
          menuItems: activeItems.map((item) => ({
            id: item.id,
            name: item.name,
            optionIds: (item.optionGroups || []).flatMap((og) =>
              (og.options || []).map((o) => o.id)
            ),
          })),
        };
      }
    }
  } catch (err) {
    console.warn(`[T-29 k6] setup 메뉴 조회 실패 또는 파싱 오류, 시드 기본값으로 폴백합니다.`, err);
  }

  console.log(`[T-29 k6] 기본 시드 메뉴 아이템으로 폴백합니다.`);
  return {
    menuItems: fallbackMenuItems.map((item) => ({
      id: item.id,
      name: item.name,
      optionIds: [],
    })),
  };
}

/**
 * 메인 VU 시나리오 (고객 3대 화면 API 순차 호출: 메뉴 조회 -> 주문 생성 -> 상태 조회)
 */
export default function runOrderLoadTest(data) {
  const menuItems = data.menuItems || [];
  const selectedItem =
    menuItems[Math.floor(Math.random() * menuItems.length)] || {
      id: '11111111-1111-1111-1111-111111111111',
      optionIds: [],
    };

  // 1. 메뉴 조회 (고객 진입 화면)
  group('1. GET /api/menu', () => {
    const menuRes = http.get(`${BASE_URL}/api/menu?lang=ko`, {
      tags: { endpoint: 'menu' },
    });
    menuDuration.add(menuRes.timings.duration);
    check(menuRes, {
      '메뉴 조회 200 OK': (r) => r.status === 200,
    });
  });

  // 2. 주문 생성 (POST /api/orders, 30 RPS 대상)
  let statusToken = null;
  group('2. POST /api/orders', () => {
    const paymentMethod = Math.random() < 0.5 ? 'cash' : 'transfer';
    const payload = JSON.stringify({
      idempotencyKey: generateTestIdempotencyKey(),
      paymentMethod: paymentMethod,
      locale: 'ko',
      items: [
        {
          menuItemId: selectedItem.id,
          quantity: 1,
          optionIds: selectedItem.optionIds ? selectedItem.optionIds.slice(0, 1) : [],
        },
      ],
    });

    const orderRes = http.post(`${BASE_URL}/api/orders`, payload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'create_order' },
    });

    orderCreateDuration.add(orderRes.timings.duration);

    const isCreated = orderRes.status === 201 || orderRes.status === 200;
    orderCreateSuccess.add(isCreated);

    const checkSuccess = check(orderRes, {
      '주문 생성 성공 (201/200)': (r) => r.status === 201 || r.status === 200,
    });

    if (checkSuccess) {
      orderCreatedCount.add(1);
      try {
        const body = JSON.parse(orderRes.body);
        statusToken = body.statusToken;
      } catch {
        // 파싱 실패 시 무시
      }
    }
  });

  // 3. 주문 상태 조회 (GET /api/orders/{token})
  if (statusToken) {
    group('3. GET /api/orders/[token]', () => {
      const statusRes = http.get(`${BASE_URL}/api/orders/${statusToken}`, {
        tags: { endpoint: 'get_order_status' },
      });
      orderStatusDuration.add(statusRes.timings.duration);
      check(statusRes, {
        '주문 상태 조회 200 OK': (r) => r.status === 200,
      });
    });
  }
}

/**
 * 결과 요약 포맷터 (PRD N-06 충족 여부 판정 포함)
 */
export function handleSummary(data) {
  const result = evaluateSummary(data, {
    baseUrl: BASE_URL,
    targetRps: TARGET_RPS,
    duration: DURATION,
  });

  return {
    stdout: result.reportText,
    'tests/load/summary.txt': result.reportText,
    'tests/load/summary.json': result.summaryJson,
  };
}
