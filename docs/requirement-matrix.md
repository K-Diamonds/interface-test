# Requirement matrix (Sections 3.1–3.7)

Hosted execution reflects the active runtime truthfully:

- Local runtime: API-owned Playwright / local Chromium.
- Hosted runtime: Vercel control plane + Browserbase `ComputerSurface` when browser, persistence, and model readiness are healthy.
- Fallback: catalog/evidence-only mode when hosted runtime dependencies are unavailable.
- Hosted Browserbase: **implemented**. **Live verified:** no `evidence/hosted/` yet.

| Requirement | Implementation | Test | Evidence |
| --- | --- | --- | --- |
| **3.1** Goal-driven agent loop | `discovery-agent` + `DiscoveryModel` (Gemini/OpenAI); policy-checked `ComputerSurface` | `discovery-model.test.ts`, `discovery-bounds.test.ts` | `evidence/discovery/canonical-llm-run/` |
| **3.2** Structured artifact | `@cu/contracts` + `CapabilityStore` JSON | `capability-schema.test.ts` | `artifacts/capabilities/cart.add-product/v2.json` |
| **3.3** Deterministic replay | `replayCapability` — no model | architecture + `replay-engine.test.ts` | `evidence/replay/canonical-success/` |
| **3.3** Alternate parameters | `{{productName}}` binding | replay engine | `evidence/replay/canonical-alt-product/` |
| **3.3** Business outcome | `knownOutcomes` / error-detector | `PRODUCT_NOT_FOUND` replay test | `evidence/replay/business-outcome/` |
| **3.3** Recoverable condition | Declared `recoveryRules`; no LLM | `recovery-guardrails.test.ts` | `evidence/replay/recoverable-condition/` |
| **3.3** Hard failure | `resolveFailureResult` | checkpoint failure test | `evidence/replay/hard-failure/` |
| **3.4** Safety | Guardrails, fail-closed risk, redaction | `guardrails.test.ts`, `redaction.test.ts` | Canonical allowlist; `[REDACTED]` human-actions |
| **3.5** Evidence | `Logger` + `EvidenceStore` | `evidence-paths.test.ts` | `events.jsonl`, screenshots, `trace.zip` |
| **3.6** Same-session handoff | `SessionController` + intervention service | resume/abort replay tests | `evidence/intervention/same-session-handoff/` |
| **3.7** Heterogeneity | `ComputerSurface` + ARIA snapshot + relative targets | `relative-target.test.ts` | Hostile-ledger fixture (not a second app) |
| **3.7** Multi-tenant / drift | Pure `resolveCapabilityVariant`; `DriftSignal` | `capability-variant.test.ts` | Schema + tests; no tenant infra |
| Stretch: agent catalog/invoke | `GET/POST /api/agent/capabilities…` → `replayCapabilityApp` | `agent-api.test.ts` | `evidence/agent-invocation/canonical/` |
| Stretch: approval/reliability | Fail-closed draft; evidence-derived counts | `agent-api.test.ts` | Capability detail UI; no fake confidence |

Implemented: Playwright adapter, ARIA-snapshot (+ semantic-DOM fallback), relative targets, declared recovery, overlay resolver, drift events, agent catalog, approved-only unattended invoke, replay-evidence reliability. Designed only: desktop/OS automation, vision execution, vault, drift platform, codegen, LLM replay fallback, N-run load.
