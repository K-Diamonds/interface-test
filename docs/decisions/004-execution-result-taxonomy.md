# ADR 004: Execution Result Taxonomy

## Context

Callers must distinguish success, expected business outcomes, human intervention, and hard failures without parsing logs.

## Decision

Use a discriminated union `CapabilityExecutionResult`:

- `success` — steps + final checkpoint + validated outputs
- `business_outcome` — expected domain states (e.g. PRODUCT_NOT_FOUND)
- `intervention_required` — control transferred to human
- `failure` — structured category/code/step/expected/observed/evidence

Checkpoints and target resolution prefer structured results; adapters may throw at boundaries.

## Consequences

- Machine-readable contracts for orchestration.
- Business outcomes are not crashes.
- Evidence always accompanies non-success paths.
- Operator abort is `failure.code = ABORTED` (not a fifth public result). Resume after intervention returns to the single replay finalization path so declared outputs are not dropped.

## Alternatives considered

- `{ success: boolean; error?: string }`: rejected.
- Throw for all non-success: rejected (conflates outcomes with failures).
