# ADR 002: Semantic Capability Artifacts

## Context

Legacy and heterogeneous UIs cannot assume CSS/DOM stability. Encoding Playwright nth-child selectors into long-lived capabilities locks the system to one surface technology.

## Decision

Artifacts store **semantic targets** (`TargetDescriptor` with ordered locator strategies: role/name → label → text → attributes → CSS → XPath) plus checkpoints, typed contracts, policy, and known business outcomes.

Concrete discovery values become parameter bindings (`{{productName}}` / `{ source: "input", name }`).

## Consequences

- Locator resolution is infrastructure; semantic intent stays in the artifact.
- Future desktop/a11y/vision adapters can resolve the same descriptors.
- Brittle selectors are last-resort fallbacks, not primary definitions.

## Alternatives considered

- Record raw Playwright codegen: rejected.
- Require test IDs everywhere: unrealistic for legacy apps.
