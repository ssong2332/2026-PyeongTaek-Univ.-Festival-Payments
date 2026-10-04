import { describe, expect, it } from "vitest";
import { getClientIp, hashClientIp, getClientRateLimitKey } from "@/lib/api/clientIp";

describe("lib/api/clientIp (ADR-0009, T-51)", () => {
  describe("getClientIp 헤더 우선순위 판별", () => {
    it("cf-connecting-ip가 있으면 다른 헤더가 있어도 우선 추출한다", () => {
      const request = new Request("http://localhost/api/orders", {
        headers: {
          "cf-connecting-ip": "203.0.113.195",
          "x-forwarded-for": "198.51.100.1, 198.51.100.2",
          "x-real-ip": "192.0.2.1",
        },
      });
      expect(getClientIp(request)).toBe("203.0.113.195");
    });

    it("cf-connecting-ip가 없으면 x-forwarded-for의 첫 번째 IP를 공백 제거 후 추출한다", () => {
      const request = new Request("http://localhost/api/orders", {
        headers: {
          "x-forwarded-for": "  198.51.100.1  , 198.51.100.2",
          "x-real-ip": "192.0.2.1",
        },
      });
      expect(getClientIp(request)).toBe("198.51.100.1");
    });

    it("cf-connecting-ip와 x-forwarded-for가 없으면 x-real-ip를 추출한다", () => {
      const request = new Request("http://localhost/api/orders", {
        headers: {
          "x-real-ip": "  192.0.2.1  ",
        },
      });
      expect(getClientIp(request)).toBe("192.0.2.1");
    });

    it("프록시 헤더가 전혀 없으면 'unknown'을 반환한다", () => {
      const request = new Request("http://localhost/api/orders");
      expect(getClientIp(request)).toBe("unknown");
    });

    it("헤더 값이 빈 문자열이거나 공백뿐이면 다음 우선순위로 넘어가고 최종 'unknown'이 된다", () => {
      const request = new Request("http://localhost/api/orders", {
        headers: {
          "cf-connecting-ip": "   ",
          "x-forwarded-for": "",
          "x-real-ip": "   ",
        },
      });
      expect(getClientIp(request)).toBe("unknown");
    });
  });

  describe("hashClientIp 및 getClientRateLimitKey", () => {
    it("IP를 SHA-256 해시하여 앞 32자리의 16진수 문자열로 반환한다 (F-47 / ADR-0009)", () => {
      const ip = "203.0.113.195";
      const hash = hashClientIp(ip);

      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
      // 동일한 IP에 대해 항상 일관된 해시를 생성
      expect(hashClientIp(ip)).toBe(hash);
      // 다른 IP는 다른 해시 생성
      expect(hashClientIp("203.0.113.196")).not.toBe(hash);
    });

    it("getClientRateLimitKey는 request 객체로부터 32자 키를 생성한다", () => {
      const request = new Request("http://localhost/api/orders", {
        headers: { "cf-connecting-ip": "1.2.3.4" },
      });
      const key = getClientRateLimitKey(request);
      expect(key).toHaveLength(32);
      expect(key).toBe(hashClientIp("1.2.3.4"));
    });
  });
});
