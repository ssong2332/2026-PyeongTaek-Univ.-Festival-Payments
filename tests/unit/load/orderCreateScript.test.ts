import { describe, it, expect } from 'vitest';
import { CreateOrderRequestSchema } from '@/lib/dto/order';
import { generateTestIdempotencyKey, evaluateSummary } from '../../load/helpers.js';

describe('T-29 k6 Load Test Configuration & Helpers', () => {
  describe('generateTestIdempotencyKey', () => {
    it('generates a valid RFC 4122 UUID v4 that satisfies CreateOrderRequestSchema', () => {
      for (let i = 0; i < 20; i++) {
        const uuid = generateTestIdempotencyKey();

        // 1. DTO 스키마 검증 (z.uuid())
        const schemaTest = CreateOrderRequestSchema.shape.idempotencyKey.safeParse(uuid);
        expect(schemaTest.success).toBe(true);

        // 2. 테스트 전용 식별 프리픽스 확인
        expect(uuid.startsWith('00000000-0000-4a29-')).toBe(true);
      }
    });

    it('generates unique keys across multiple invocations', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 50; i++) {
        keys.add(generateTestIdempotencyKey());
      }
      expect(keys.size).toBe(50);
    });
  });

  describe('evaluateSummary', () => {
    it('generates PASS summary report when metrics meet N-06 criteria', () => {
      const mockMetrics = {
        metrics: {
          http_reqs: { values: { count: 900 } },
          http_req_failed: { values: { rate: 0.0 } },
          http_req_duration: { values: { 'p(95)': 120.5 } },
          menu_duration: { values: { 'p(95)': 85.0 } },
          order_create_duration: { values: { 'p(95)': 180.2 } },
          order_status_duration: { values: { 'p(95)': 45.1 } },
          order_created_count: { values: { count: 300 } },
          order_create_success: { values: { rate: 1.0 } },
        },
      };

      const result = evaluateSummary(mockMetrics, {
        baseUrl: 'http://localhost:3000',
        targetRps: 30,
        duration: '30s',
      });

      expect(result.isAllPassed).toBe(true);
      expect(result.passFailed).toBe(true);
      expect(result.passP95).toBe(true);
      expect(result.passOrderSuccess).toBe(true);
      expect(result.reportText).toContain('T-29 k6 부하 검증 결과 요약');
      expect(result.reportText).toContain('PRD N-06 기준 통과 (ALL PASS)');
      expect(result.reportText).toContain('생성된 주문 수: 300 건');
      expect(result.summaryJson).toBeDefined();
    });

    it('generates FAIL summary report when failure rate or latency exceeds threshold', () => {
      const mockFailMetrics = {
        metrics: {
          http_reqs: { values: { count: 900 } },
          http_req_failed: { values: { rate: 0.05 } }, // 5% 실패
          http_req_duration: { values: { 'p(95)': 1500.0 } }, // 1.5초 지연
          menu_duration: { values: { 'p(95)': 500.0 } },
          order_create_duration: { values: { 'p(95)': 1600.0 } },
          order_status_duration: { values: { 'p(95)': 200.0 } },
          order_created_count: { values: { count: 280 } },
          order_create_success: { values: { rate: 0.95 } },
        },
      };

      const result = evaluateSummary(mockFailMetrics, {
        baseUrl: 'http://localhost:3000',
        targetRps: 30,
        duration: '30s',
      });

      expect(result.isAllPassed).toBe(false);
      expect(result.passFailed).toBe(false);
      expect(result.passP95).toBe(false);
      expect(result.reportText).toContain('기준 미달 (FAIL)');
    });
  });
});
