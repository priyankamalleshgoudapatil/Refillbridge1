export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'MFA_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_TRANSITION'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'AI_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR';

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_FILE: 415,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  AI_UNAVAILABLE: 503,
  TIMEOUT: 504,
  NETWORK_ERROR: 0,
  INTERNAL_ERROR: 500,
};

/** Normalised API error — the same shape the real api-client produces from the error envelope. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: ApiErrorCode, message: string, opts: { requestId?: string; fieldErrors?: Record<string, string> } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
    this.requestId = opts.requestId ?? newRequestId();
    this.fieldErrors = opts.fieldErrors;
  }
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function friendlyMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'RATE_LIMITED') return "You're going a bit fast. Try again in a minute.";
    if (err.code === 'TIMEOUT') return 'This is taking too long. Check your connection and try again.';
    if (err.code === 'NETWORK_ERROR') return "You're offline. Reconnect and try again.";
    if (err.code === 'INTERNAL_ERROR') return 'Something went wrong on our side. Please try again.';
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}
