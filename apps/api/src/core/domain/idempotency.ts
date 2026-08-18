import { ActionIdempotency, ActionType } from "@cu/contracts";

/**
 * Idempotency classification drives retry safety.
 * Non-idempotent / irreversible actions must not be blindly re-issued.
 * Declared step.idempotency always wins over heuristics.
 */
export function classifyIdempotency(input: {
  actionType: ActionType;
  description?: string;
  declared?: ActionIdempotency;
}): ActionIdempotency {
  if (input.declared) return input.declared;

  if (
    input.actionType === ActionType.Read ||
    input.actionType === ActionType.Wait ||
    input.actionType === ActionType.Extract ||
    input.actionType === ActionType.Checkpoint
  ) {
    return ActionIdempotency.ReadOnly;
  }

  const hay = `${input.description ?? ""}`.toLowerCase();
  if (
    /purchase|checkout|pay|transfer|delete|destroy|confirm order|submit payment/.test(
      hay,
    )
  ) {
    return ActionIdempotency.Irreversible;
  }
  if (/submit|confirm|send|approve/.test(hay)) {
    return ActionIdempotency.PotentiallyNonIdempotent;
  }
  if (
    input.actionType === ActionType.Click ||
    input.actionType === ActionType.Type ||
    input.actionType === ActionType.Navigate ||
    input.actionType === ActionType.Select
  ) {
    return ActionIdempotency.Idempotent;
  }
  return ActionIdempotency.Idempotent;
}

export function mayAutoRetry(idempotency: ActionIdempotency): boolean {
  return (
    idempotency === ActionIdempotency.ReadOnly ||
    idempotency === ActionIdempotency.Idempotent
  );
}
