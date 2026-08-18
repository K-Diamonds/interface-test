# ADR 003: ComputerSurface Port

## Context

Replay and discovery must not depend on Playwright’s `Page` API. The real product eventually needs browser, accessibility, and desktop surfaces.

## Decision

Introduce `ComputerSurface` as a domain port. `PlaywrightSurface` is an infrastructure adapter. Replay/discovery depend only on the port.

## Consequences

- Domain/replay packages can be unit-tested with fake surfaces.
- Playwright imports stay in `surfaces/browser/`.
- New adapters plug in without rewriting capabilities.

## Alternatives considered

- Thin Playwright wrapper used everywhere: rejected (contamination).
- Full multi-surface implementation now: out of take-home scope.
