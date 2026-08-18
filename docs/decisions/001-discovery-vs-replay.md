# ADR 001: Discovery vs Replay Separation

## Context

Computer-use agents are probabilistic. Production invocations need deterministic, auditable behavior with explicit failure semantics. Mixing LLM decisions into every run makes results non-reproducible and hard to regulate.

## Decision

Separate the system into two modes:

1. **Discovery** — LLM proposes structured actions; application validates, policies, and executes against a live `ComputerSurface`.
2. **Replay** — a typed capability artifact is interpreted deterministically with **zero** LLM decisions.

The durable asset is the capability artifact, not the model transcript.

## Consequences

- Replay can be tested without network/LLM credentials.
- Discovery quality affects artifact quality, not every production run.
- Compilers must parameterize and attach checkpoints — not dump chat history.

## Alternatives considered

- Always LLM-drive production: rejected (non-determinism, cost, safety).
- Record raw Playwright scripts: rejected (brittle, DOM-coupled, poor parameterization).
