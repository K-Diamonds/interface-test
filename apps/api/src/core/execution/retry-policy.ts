import {
  ActionIdempotency,
  BackoffStrategy,
  RecoverableErrorCode,
} from "@cu/contracts";
import type { RetryPolicy } from "@cu/contracts";
import { RecoverableError } from "../errors.js";
import { mayAutoRetry } from "../domain/idempotency.js";

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  delayMs: 400,
  backoff: BackoffStrategy.Fixed,
  retryOn: [
    RecoverableErrorCode.ElementDetached,
    RecoverableErrorCode.LoadingDelay,
    RecoverableErrorCode.StaleElement,
    RecoverableErrorCode.TransientTimeout,
    RecoverableErrorCode.TemporaryDialog,
  ],
};

export function computeDelay(policy: RetryPolicy, attempt: number): number {
  if (policy.backoff === BackoffStrategy.Exponential) {
    return policy.delayMs * Math.pow(2, attempt - 1);
  }
  return policy.delayMs;
}

export function shouldRetry(
  policy: RetryPolicy,
  attempt: number,
  error: unknown,
  idempotency: ActionIdempotency = ActionIdempotency.Idempotent,
): boolean {
  if (attempt >= policy.maxAttempts) return false;
  // Never blindly re-issue irreversible / ambiguous non-idempotent actions.
  if (!mayAutoRetry(idempotency)) return false;

  if (error instanceof RecoverableError) {
    return policy.retryOn.includes(error.recoverableCode);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    /timeout/i.test(message) &&
    policy.retryOn.includes(RecoverableErrorCode.TransientTimeout)
  ) {
    return true;
  }
  if (
    /detached|stale/i.test(message) &&
    policy.retryOn.includes(RecoverableErrorCode.ElementDetached)
  ) {
    return true;
  }
  return false;
}

export async function withRetry<T>(
  policy: RetryPolicy,
  fn: (attempt: number) => Promise<T>,
  onRetry?: (
    attempt: number,
    error: unknown,
    delayMs: number,
  ) => Promise<void> | void,
  idempotency: ActionIdempotency = ActionIdempotency.Idempotent,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < policy.maxAttempts) {
    attempt += 1;
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (!shouldRetry(policy, attempt, err, idempotency)) {
        throw err;
      }
      const delay = computeDelay(policy, attempt);
      await onRetry?.(attempt, err, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
