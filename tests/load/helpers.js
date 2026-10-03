/**
 * T-29: k6 부하 검증 헬퍼 유틸리티
 */

/**
 * RFC 4122 v4 UUID 생성 (부하 테스트 식별 프리픽스 00000000-0000-4a29- 포맷)
 * 8-4-4-4-12 표준 규격 및 Zod z.uuid() 규격을 준수하면서 DB 정리(cleanup) 시 고유 식별 가능
 */
export function generateTestIdempotencyKey() {
  const variant = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
  const hex3 = Array.from({ length: 3 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const hex12 = Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `00000000-0000-4a29-${variant}${hex3}-${hex12}`;
}

/**
 * k6 summary 메트릭을 평가하고 리포트를 생성하는 순수 함수
 */
export function evaluateSummary(data, options = {}) {
  const baseUrl = options.baseUrl || 'http://localhost:3000';
  const targetRps = options.targetRps || 30;
  const duration = options.duration || '30s';

  const reqTotal = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
  const reqFailedRate = data.metrics.http_req_failed ? data.metrics.http_req_failed.values.rate : 0;
  const p95Total = data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'] : 0;

  const menuP95 = data.metrics.menu_duration ? data.metrics.menu_duration.values['p(95)'] : 0;
  const createOrderP95 = data.metrics.order_create_duration ? data.metrics.order_create_duration.values['p(95)'] : 0;
  const getOrderP95 = data.metrics.order_status_duration ? data.metrics.order_status_duration.values['p(95)'] : 0;

  const ordersCreated = data.metrics.order_created_count ? data.metrics.order_created_count.values.count : 0;
  const orderSuccessRate = data.metrics.order_create_success ? data.metrics.order_create_success.values.rate : 0;

  const passFailed = reqFailedRate < 0.01;
  const passP95 = p95Total < 1000;
  const passOrderSuccess = orderSuccessRate >= 0.99;
  const isAllPassed = passFailed && passP95 && passOrderSuccess;

  const reportText = `
================================================================================
                    T-29 k6 부하 검증 결과 요약 (PRD N-06)
================================================================================
- 대상 서버: ${baseUrl}
- 목표 RPS: ${targetRps} RPS (기준: 10 RPS × 3배)
- 실행 시간: ${duration}
- 총 HTTP 요청 수: ${reqTotal} 건
- 생성된 주문 수: ${ordersCreated} 건

--------------------------------------------------------------------------------
1. 성능 및 응답시간 (목표: p95 1초(1000ms) 이내)
--------------------------------------------------------------------------------
- 전체 HTTP p95: ${p95Total ? p95Total.toFixed(2) : 'N/A'} ms [${passP95 ? 'PASS' : 'FAIL'}]
- 1. 메뉴 조회 (/api/menu) p95: ${menuP95 ? menuP95.toFixed(2) : 'N/A'} ms
- 2. 주문 생성 (/api/orders) p95: ${createOrderP95 ? createOrderP95.toFixed(2) : 'N/A'} ms
- 3. 상태 조회 (/api/orders/[token]) p95: ${getOrderP95 ? getOrderP95.toFixed(2) : 'N/A'} ms

--------------------------------------------------------------------------------
2. 오류율 및 안정성 (목표: 오류율 0%)
--------------------------------------------------------------------------------
- HTTP 실패율: ${(reqFailedRate * 100).toFixed(2)} % [${passFailed ? 'PASS' : 'FAIL'}]
- 주문 생성 성공률: ${(orderSuccessRate * 100).toFixed(2)} % [${passOrderSuccess ? 'PASS' : 'FAIL'}]

--------------------------------------------------------------------------------
3. 최종 종합 판정
--------------------------------------------------------------------------------
  ${isAllPassed ? '>>> [PRD N-06 기준 통과 (ALL PASS)] <<<' : '>>> [기준 미달 (FAIL) - 추가 튜닝 필요] <<<'}
================================================================================
`;

  return {
    isAllPassed,
    passFailed,
    passP95,
    passOrderSuccess,
    reportText,
    summaryJson: JSON.stringify(data, null, 2),
  };
}
