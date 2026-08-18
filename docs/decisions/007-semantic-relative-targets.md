# ADR 007: Semantic relative targets

## Context

Legacy UIs often require “find this record, then activate the control in the same container.” Encoding that as XPath/CSS works for one browser DOM, but it is not portable across adapters and hides the semantic relationship.

## Decision

Add locator kind `relative` with an explicit `anchor`, `target`, and `relationship`
(`same-container | descendant | ancestor | following | nearest`).

The capability artifact expresses intent. The surface adapter translates the relationship (DOM ancestor walk today; accessibility group / visual region later). CSS and XPath remain last-resort fallbacks.

## Consequences

- Replay/core continue to see only `TargetDescriptor`.
- Ambiguous identical controls fail closed unless a relative anchor disambiguates them.
- Application profiles may emit relative primaries (e.g. product name → Add to cart) without leaking DOM into the compiler.

## Alternatives considered

- XPath-only “same container” encoding: rejected (adapter-specific, unreadable).
- LLM disambiguation at replay time: rejected (breaks determinism).
