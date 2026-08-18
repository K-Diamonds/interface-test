# ADR 006 — Application profile vs generic platform

## Status

Accepted

## Context

The take-home demo target is SauceDemo, but the platform must remain a generic
computer-use capability system. Embedding cart/product/login page semantics in
the compiler or replay engine makes the architecture indefensible.

## Decision

Split responsibilities:

1. **Capability compiler** — discovery traces → typed capability artifacts
   using only contracts, targets, bindings, checkpoints, effects, and risk.
2. **DiscoveryContract** — declares inputs, outputs, success, known outcomes
   for a goal family.
3. **ApplicationProfile** — optional DI seam for target normalization,
   observation enrichment, goal verification, and session bootstrap.

SauceDemo-specific behavior lives in
`apps/api/src/profiles/saucedemo/` (profile, policy, and offline scripted model).

Generic modules (`capability-compiler`, `replay-engine`, `output-extractor`,
`ComputerSurface`) must not import SauceDemo types or product/cart keywords.

## Consequences

- New applications add a profile + contract; they do not fork the engine.
- Reviewers can grep for domain terms and expect only profile/demo/test hits.
- Credentials are declared by the contract / parameters, not auto-injected by
  the generic compiler for every capability.
