import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { evaluateSummary } from './helpers.js';
import { assertLocalTarget, assertRunId, clientIp, runKey } from './safety.js';

const BASE_URL = __ENV.BASE_URL;
const DB_URL = __ENV.LOAD_TEST_SUPABASE_URL;
const RUN = __ENV.LOAD_TEST_RUN_ID;
assertLocalTarget(BASE_URL, __ENV.LOAD_TEST_ISOLATED);
assertLocalTarget(DB_URL, __ENV.LOAD_TEST_ISOLATED);
assertRunId(RUN);
// Fixed aggregate 30 RPS, 60 clients = 30 requests/client/minute.
const TARGET_RPS = 30;
if (__ENV.RATE && __ENV.RATE !== '30') throw new Error('N-06 requires RATE=30');
const DURATION = __ENV.DURATION || '30s';
if (!/^[1-9][0-9]*s$/.test(DURATION) || parseInt(DURATION, 10) > 120) throw new Error('DURATION must be 1s..120s');
const expected = TARGET_RPS * parseInt(DURATION, 10);
const menuDuration = new Trend('menu_duration', true);
const orderCreateDuration = new Trend('order_create_duration', true);
const orderStatusDuration = new Trend('order_status_duration', true);
const orderCreateSuccess = new Rate('order_create_success');
const orderCreatedCount = new Counter('order_created_count');
const completed = new Counter('completed_orders');

export const options = {
  maxRedirects: 0,
  scenarios: { order_load_test: {
    executor: 'constant-arrival-rate', rate: TARGET_RPS, timeUnit: '1s', duration: DURATION,
    preAllocatedVUs: 60, maxVUs: 150,
  } },
  thresholds: {
    http_req_failed: ['rate==0'], checks: ['rate==1'],
    http_req_duration: ['p(95)<1000'], menu_duration: ['p(95)<1000'],
    order_create_duration: ['p(95)<1000'], order_status_duration: ['p(95)<1000'],
    order_create_success: ['rate==1'], dropped_iterations: ['count==0'],
    order_created_count: [`count>=${expected}`], completed_orders: [`count>=${expected}`],
  },
};

export function setup() {
  console.log(`T-29 local target=${BASE_URL}; database=${DB_URL}; run=${RUN}; aggregate=30 RPS / 60 clients`);
  const proof = http.get(`${BASE_URL}/api/load-test/preflight`, { redirects: 0 });
  let identity;
  try { identity = proof.json(); } catch { throw new Error('Local database preflight unavailable'); }
  if (proof.status !== 200 || identity.dbUrl !== DB_URL || identity.run !== RUN || !identity.prepared ||
      proof.headers['Cf-Ray'] || proof.headers['Cf-Connecting-Ip']) throw new Error('Target/database mismatch or Cloudflare target');
  const res = http.get(`${BASE_URL}/api/menu?lang=ko`, { redirects: 0 });
  if (res.status !== 200) throw new Error('Menu preflight failed');
  const menuItems = res.json().items.filter((item) => item.isAvailable && !item.isSoldOut && item.stock >= expected);
  if (!menuItems.length) throw new Error('No available menus');
  return { menuItems };
}

export default function runOrderLoadTest(data) {
  const iteration = exec.scenario.iterationInTest;
  const headers = { 'Content-Type': 'application/json', 'x-forwarded-for': clientIp(iteration) };
  const selected = data.menuItems[iteration % data.menuItems.length];
  const menu = http.get(`${BASE_URL}/api/menu?lang=ko`, { headers, tags: { endpoint: 'menu' } });
  menuDuration.add(menu.timings.duration);
  const menuOK = check(menu, { 'menu 200': (r) => r.status === 200 });
  const order = http.post(`${BASE_URL}/api/orders`, JSON.stringify({
    idempotencyKey: runKey(RUN, iteration), paymentMethod: 'cash', locale: 'ko',
    items: [{ menuItemId: selected.id, quantity: 1,
      optionIds: (selected.optionGroups || []).flatMap((g) => g.options.slice(0, g.minSelect || 0).map((o) => o.id)) }],
  }), { headers, tags: { endpoint: 'create_order' } });
  orderCreateDuration.add(order.timings.duration);
  let body;
  try { body = order.json(); } catch { body = null; }
  const created = order.status === 201 && body?.created === true && /^[0-9a-f]{64}$/.test(body?.statusToken || '');
  orderCreateSuccess.add(created);
  check(created, { 'fresh order with valid token': (ok) => ok });
  if (!created) return;
  orderCreatedCount.add(1);
  const status = http.get(`${BASE_URL}/api/orders/${body.statusToken}`, { headers, tags: { endpoint: 'get_order_status' } });
  orderStatusDuration.add(status.timings.duration);
  if (check(status, { 'status 200': (r) => r.status === 200 }) && menuOK) completed.add(1);
}

export function handleSummary(data) {
  const result = evaluateSummary(data, { baseUrl: BASE_URL, targetRps: TARGET_RPS, duration: DURATION });
  return { stdout: result.reportText, 'tests/load/summary.txt': result.reportText, 'tests/load/summary.json': result.summaryJson };
}

