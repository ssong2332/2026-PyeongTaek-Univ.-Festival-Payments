// Architecture.md / ADR-0009 / DECISIONS #44
// 주문 생성 속도 제한 한도 (단일 원본). 변경 시 코드 수정 + 배포로 진행.
export const ORDER_CREATE_RATE_LIMIT = {
  limit: 100,
  windowSeconds: 60,
} as const;

export type OrderCreateRateLimit = typeof ORDER_CREATE_RATE_LIMIT;
