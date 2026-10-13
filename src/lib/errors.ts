export type ErrorCode =
  | 'validation_error'
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'out_of_stock'
  | 'rate_limited'
  | 'feature_disabled'
  | 'payment_unavailable'
  | 'shipping_unavailable'
  | 'policy_not_configured'
  | 'state_conflict'
  | 'csrf_failed'
  | 'internal_error';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly publicMessage: string;

  constructor(
    code: ErrorCode,
    publicMessage: string,
    status = 400,
    fieldErrors?: Record<string, string>,
  ) {
    super(publicMessage);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
    this.fieldErrors = fieldErrors;
  }
}

export const statusForCode = (code: ErrorCode): number => {
  switch (code) {
    case 'not_found':
      return 404;
    case 'unauthorized':
    case 'csrf_failed':
      return 401;
    case 'forbidden':
      return 403;
    case 'conflict':
    case 'state_conflict':
      return 409;
    case 'out_of_stock':
      return 422;
    case 'rate_limited':
      return 429;
    case 'feature_disabled':
    case 'payment_unavailable':
    case 'shipping_unavailable':
    case 'policy_not_configured':
      return 503;
    case 'internal_error':
      return 500;
    default:
      return 400;
  }
};
