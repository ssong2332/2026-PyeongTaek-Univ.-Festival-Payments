// Architecture "5. API 규격 — 공통" ErrorCode 표. HTTP 상태는 던지는 쪽이 이 표대로 넘긴다.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "REASON_REQUIRED"
  | "REFUND_CHANNEL_REQUIRED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "MENU_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "INVALID_OPTION"
  | "INVALID_TRANSITION"
  | "STATE_CHANGED"
  | "CANCEL_REQUEST_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

// message는 생성자 인자가 아니다 — API 응답 변환 시 code에 대응하는 고정 영문 문구로 정한다(CodingRules "에러 처리").
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "AppError";
  }
}
