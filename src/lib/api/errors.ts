// Architecture "5. API 규격 — 공통" ErrorCode 표. HTTP 상태는 코드마다 고정이라 여기서만 정한다.
const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  REASON_REQUIRED: 400,
  REFUND_CHANNEL_REQUIRED: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  MENU_UNAVAILABLE: 409,
  OUT_OF_STOCK: 409,
  INVALID_OPTION: 409,
  INVALID_TRANSITION: 409,
  STATE_CHANGED: 409,
  CANCEL_REQUEST_NOT_ALLOWED: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly details?: unknown,
    message: string = code,
  ) {
    super(message);
    this.name = "AppError";
    this.status = ERROR_STATUS[code];
  }
}
