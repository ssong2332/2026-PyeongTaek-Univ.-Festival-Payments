/**
 * T-29: k6 부하 검증 데이터 정리 순수 로직
 */

export const TEST_ORDER_IDEMPOTENCY_PREFIX = '00000000-0000-4a29-';

/**
 * 주어진 멱등키가 k6 부하 테스트로 생성된 주문인지 판별
 */
export function isLoadTestIdempotencyKey(key) {
  if (typeof key !== 'string') return false;
  return key.startsWith(TEST_ORDER_IDEMPOTENCY_PREFIX);
}

/**
 * 삭제 대상 주문의 항목 목록으로부터 메뉴별 복구 수량을 집계
 */
export function aggregateStockRestoration(orderItems = []) {
  const stockMap = {};
  for (const item of orderItems) {
    if (!item.menu_item_id || typeof item.quantity !== 'number') continue;
    stockMap[item.menu_item_id] = (stockMap[item.menu_item_id] || 0) + item.quantity;
  }
  return stockMap;
}
