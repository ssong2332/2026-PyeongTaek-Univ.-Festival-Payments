import { describe, it, expect } from 'vitest';
import { assertLocalTarget, assertRunId, clientIp, runKey } from '../../load/safety.js';
import { CreateOrderRequestSchema } from '@/lib/dto/order';
import { evaluateSummary } from '../../load/helpers.js';

describe('T-29 safety', () => {
  it('rejects remote, credentials, paths, lookalike hosts and missing opt-in', () => {
    for (const url of ['https://project.supabase.co', 'http://localhost.evil:3000', 'http://localhost:3000@evil:80', 'http://127.0.0.1:3000/path', 'http://127.1:3000', undefined]) {
      expect(() => assertLocalTarget(url, 'YES')).toThrow();
    }
    expect(() => assertLocalTarget('http://127.0.0.1:3000', undefined)).toThrow();
    expect(() => assertLocalTarget('http://127.0.0.1:3000', 'YES')).not.toThrow();
    expect(() => assertRunId('anything')).toThrow();
  });
  it('distributes 1800 requests evenly across 60 clients within the T-51 limit', () => {
    const counts = new Map<string, number>();
    const keys = new Set<string>();
    for (let i = 0; i < 1800; i++) {
      counts.set(clientIp(i), (counts.get(clientIp(i)) || 0) + 1);
      const key = runKey('aabbccdd', i);
      expect(CreateOrderRequestSchema.shape.idempotencyKey.safeParse(key).success).toBe(true);
      keys.add(key);
    }
    expect(counts.size).toBe(60);
    expect([...counts.values()].every(n => n === 30)).toBe(true);
    expect(keys.size).toBe(1800);
  });
  it('never passes missing metrics', () => {
    expect(evaluateSummary({ metrics: {} }).isAllPassed).toBe(false);
  });
  it('rejects even sub-1% failures and incomplete success', () => {
    const result = evaluateSummary({ metrics: {
      http_reqs: { values: { count: 2700 } },
      http_req_failed: { values: { rate: 0.001 } },
      order_create_success: { values: { rate: 0.999 } },
      order_created_count: { values: { count: 900 } },
    } });
    expect(result.passFailed).toBe(false);
    expect(result.passOrderSuccess).toBe(false);
  });
});
