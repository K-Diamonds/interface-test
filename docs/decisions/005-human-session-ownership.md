# ADR 005: Human Session Ownership

## Context

When automation cannot safely proceed, a human must act on the **same** live session (cookies, navigation, form state). Concurrent human+automation control races are unacceptable.

## Decision

Model an explicit run lifecycle and single `SessionController` (`automation` | `human`). All automated actions call `assertController("automation")`; operator actions require `human`. Intervention keeps the Playwright page open; resume revalidates state before continuing.

## Consequences

- Same-session handoff is enforceable in the domain layer, not only UI.
- Human actions are audited into evidence.
- Invalid lifecycle transitions fail closed.

## Alternatives considered

- Spawn a new browser for operators: rejected (loses session).
- UI-only disablement without backend checks: rejected (race-prone).
