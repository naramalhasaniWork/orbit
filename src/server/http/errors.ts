/**
 * Error types the route wrapper maps to HTTP responses (see map-error.ts).
 * Leaf module: no imports, so both lib/utils/api and the wrapper can depend on it.
 */

export class AuthError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "AuthError";
  }
}

/** A request the server refuses with a specific status; for cases that are not an auth failure. */
export class HttpError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "HttpError";
  }
}

/** A dependency (Redis, the job queue) is down; the request can be retried. */
export class ServiceUnavailableError extends Error {
  code: string;
  retryAfterSec: number;

  constructor(message: string, code = "SERVICE_UNAVAILABLE", retryAfterSec = 30) {
    super(message);
    this.code = code;
    this.retryAfterSec = retryAfterSec;
    this.name = "ServiceUnavailableError";
  }
}

export class QueueUnavailableError extends ServiceUnavailableError {
  constructor(message = "The job queue is unavailable", code = "QUEUE_UNAVAILABLE") {
    super(message, code);
    this.name = "QueueUnavailableError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The workspace's AI spend budget has no room for this call. */
export class BudgetExceededError extends Error {
  code = "BUDGET_EXCEEDED";

  constructor(message = "Monthly AI token budget exceeded") {
    super(message);
    this.name = "BudgetExceededError";
  }
}
