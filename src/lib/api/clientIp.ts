import { createHash } from "node:crypto";

/**
 * 프록시 헤더 우선순위(Cloudflare Workers cf-connecting-ip -> x-forwarded-for -> x-real-ip -> unknown)에
 * 따라 클라이언트 IP를 판별한다. (ADR-0009)
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp && cfConnectingIp.trim().length > 0) {
    return cfConnectingIp.trim();
  }

  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor && xForwardedFor.trim().length > 0) {
    const firstIp = xForwardedFor.split(",")[0].trim();
    if (firstIp.length > 0) {
      return firstIp;
    }
  }

  const xRealIp = headers.get("x-real-ip");
  if (xRealIp && xRealIp.trim().length > 0) {
    return xRealIp.trim();
  }

  return "unknown";
}

/**
 * 원본 IP 평문 저장을 방지하기 위해 sha256 해시의 앞 32자리를 반환한다. (ADR-0009 / F-47)
 */
export function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * Request 객체로부터 속도 제한 카운터 키(sha256 앞 32자)를 산출한다.
 */
export function getClientRateLimitKey(request: Request): string {
  return hashClientIp(getClientIp(request));
}
