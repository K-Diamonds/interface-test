import { FailureCategory, type RecoverableErrorCode } from "@cu/contracts";

export class AppError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(message: string, code: string, recoverable = false) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.recoverable = recoverable;
  }
}

export class PolicyViolationError extends AppError {
  constructor(message: string) {
    super(message, "POLICY_VIOLATION", false);
    this.name = "PolicyViolationError";
  }
}

export class LocatorError extends AppError {
  readonly category: FailureCategory;
  readonly expected?: unknown;
  readonly observed?: unknown;

  constructor(
    message: string,
    category: FailureCategory,
    expected?: unknown,
    observed?: unknown,
  ) {
    super(message, category.toUpperCase(), false);
    this.name = "LocatorError";
    this.category = category;
    this.expected = expected;
    this.observed = observed;
  }
}

export class CheckpointError extends AppError {
  readonly expected?: unknown;
  readonly observed?: unknown;

  constructor(message: string, expected?: unknown, observed?: unknown) {
    super(message, "CHECKPOINT_FAILED", false);
    this.name = "CheckpointError";
    this.expected = expected;
    this.observed = observed;
  }
}

export class RecoverableError extends AppError {
  readonly recoverableCode: RecoverableErrorCode;

  constructor(message: string, code: RecoverableErrorCode) {
    super(message, code.toUpperCase(), true);
    this.name = "RecoverableError";
    this.recoverableCode = code;
  }
}

export class ControllerOwnershipError extends AppError {
  constructor(message: string) {
    super(message, "CONTROLLER_OWNERSHIP_VIOLATION", false);
    this.name = "ControllerOwnershipError";
  }
}

export class InterventionRequiredError extends AppError {
  readonly reason: string;
  readonly stepId?: string;

  constructor(reason: string, stepId?: string) {
    super(reason, "INTERVENTION_REQUIRED", false);
    this.name = "InterventionRequiredError";
    this.reason = reason;
    this.stepId = stepId;
  }
}

export class BusinessOutcomeError extends AppError {
  readonly outcomeCode: string;
  readonly data?: Record<string, unknown>;

  constructor(code: string, message: string, data?: Record<string, unknown>) {
    super(message, code, false);
    this.name = "BusinessOutcomeError";
    this.outcomeCode = code;
    this.data = data;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", false);
    this.name = "ValidationError";
  }
}

/** Upstream model/provider failure (quota, auth, network) — not an invalid action proposal. */
export class ProviderError extends AppError {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message, "PROVIDER_ERROR", false);
    this.name = "ProviderError";
    this.status = status;
  }
}

/** Transport-layer error with HTTP status — used by application services called from routes. */
export class HttpError extends AppError {
  readonly status: number;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message, code, false);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}
