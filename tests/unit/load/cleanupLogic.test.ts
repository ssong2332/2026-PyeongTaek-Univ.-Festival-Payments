import { describe, it, expect } from 'vitest';
import {
  TEST_ORDER_IDEMPOTENCY_PREFIX,
  isLoadTestIdempotencyKey,
  aggregateStockRestoration,
} from '../../load/cleanupLogic.js';

describe('T-29 Load Test Cleanup Logic', () => {
  it('correctly identifies load test idempotency keys', () => {
    expect(isLoadTestIdempotencyKey(`${TEST_ORDER_IDEMPOTENCY_PREFIX}8abc-123456789abc`)).toBe(true);
    expect(isLoadTestIdempotencyKey('11111111-2222-3333-4444-555555555555')).toBe(false);
    expect(isLoadTestIdempotencyKey('random-idempotency-key')).toBe(false);
    expect(isLoadTestIdempotencyKey(null)).toBe(false);
    expect(isLoadTestIdempotencyKey(undefined)).toBe(false);
  });

  it('aggregates stock restoration quantities by menu_item_id', () => {
    const mockOrderItems = [
      { menu_item_id: 'menu-1', quantity: 2 },
      { menu_item_id: 'menu-2', quantity: 1 },
      { menu_item_id: 'menu-1', quantity: 3 },
      { menu_item_id: 'menu-3', quantity: 5 },
      { menu_item_id: null, quantity: 2 }, // 무효 항목 건너뜀
    ];

    const result = aggregateStockRestoration(mockOrderItems);
    expect(result).toEqual({
      'menu-1': 5,
      'menu-2': 1,
      'menu-3': 5,
    });
  });

  it('handles empty order items gracefully', () => {
    expect(aggregateStockRestoration([])).toEqual({});
  });
});
