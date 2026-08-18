# 1. Architecture

Discovery and replay are split on purpose. The LLM decides **what** to try; this system decides **how** to do it safely on a computer surface that has no API. Model proposals are untrusted: schema-validated, policy-checked, ownership-checked, then executed. `complete` is accepted only after an independent observable verifier agrees.

**TypeScript / Node** carries one Zod contract from API to web (`@cu/contracts`), with discriminated unions for results and locators, and a mature browser-automation ecosystem. **Playwright** is the implemented `ComputerSurface` adapter (real Chromium, traces, screenshots, session reuse) — not the platform abstraction. Deployment substitutes the adapter: local Chromium via `LocalPlaywrightSessionFactory`, or a Browserbase-backed Playwright page via CDP. Discovery, replay, policy, and intervention never learn which factory produced the surface. That is the proof the surface boundary is real. **Gemini** is the committed discovery provider via a `DiscoveryModel` port (`gemini` | `openai` | `ollama`); replay never instantiates a model. **SauceDemo** is a safe public proxy (login → identify item → mutate cart → review) so the take-home never touches banking PII.

Control plane: `apps/web` (React) → HTTP in `apps/api` → application services → `core/`. Root `/api` is only the Vercel adapter. `core/` does not import Express, Playwright, or LLM SDKs. Artifacts are **JSON files** (`CapabilityStore`) because they are reviewable, serializable, and versionable; a database could implement the same port later. **One local process** is intentional: the assignment is a vertical slice, and same-session human handoff is easier to prove without a worker fleet.

# 2. Artifact schema

A capability is a typed, versioned JSON document: primitive inputs/outputs, immutable `id`+`version`, parameterized steps, `primary`+`fallbacks` locators (role/name, relative relationships, then CSS/XPath), checkpoints, known business outcomes, recovery rules, and policy. A click that does not throw is not success — a checkpoint is. Credentials in the demo are invocation inputs; production secrets belong on `ApplicationProfile.bootstrapSession`.

`capability.status` (`draft | approved | deprecated`) is **governance** metadata, not part of the execution definition. Discovery always compiles `draft`. Approving a version does not rewrite steps. The agent-facing catalog (`GET /api/agent/capabilities`) exposes a typed callable descriptor (id, version, description, status, inputs, outputs) rather than locators, recovery, Playwright, or evidence paths. Invocation is `POST /api/agent/capabilities/:id/versions/:version/invoke` with `{ arguments }` validated against `contract.inputs`.

# 3. Determinism & error handling

Interface’s environment is **stable UI + frequent runtime application errors**. Production replay therefore does **not** call the LLM again to improvise. It interprets the artifact: validate → policy → resolve locators (emit `target.fallback_resolved` when a fallback is used) → act → checkpoint → declared recovery or known outcome or human or hard failure → extract/validate outputs.

- browser action completed ≠ step succeeded
- `PRODUCT_NOT_FOUND` is `business_outcome`, not a crash
- known interstitials use artifact `recoveryRules` (no LLM; same ownership/policy/risk/allowlist path)
- exhausted recovery or unknown state → `failure` or `intervention_required`
- non-idempotent actions are not blindly retried

Result taxonomy: `success | business_outcome | intervention_required | failure`. Operator abort is `failure` / `ABORTED`. Agent invocation does not wrap this in a boolean `success` field; it calls `replayCapabilityApp` (zero LLM decisions) after the status gate and input schema check.

# 4. Heterogeneity & multi-tenant

```text
Capability Artifact → Replay Engine → ComputerSurface → Surface Adapter
```

**Implemented adapter:** Playwright browser. **Designed, not implemented:** hostile/legacy browser variants, OS accessibility automation, desktop apps, vision/coordinates (`vision` locators fail closed).

Primary browser perception is Playwright’s **ARIA snapshot** (`page.ariaSnapshot`: role, name, state, dialogs), normalized into bounded `SurfaceObservation`. That is Chromium’s ARIA snapshot, not an OS accessibility-tree / AX API. When the snapshot is thin, `SemanticDomObservationProvider` supplements from DOM + ARIA attributes (`querySelectorAll`). Core never sees Playwright types. The model never receives a raw tree.

Semantic **relative** targets (`same-container | descendant | ancestor | nearest`) encode intent; adapters interpret them — web: same DOM container/row; desktop (future): same accessibility group/panel; vision (future): same visual region/card. CSS/XPath remain last-resort fallbacks for non-semantic markup. A hostile-ledger fixture proves duplicate “Submit” is ambiguous without context and resolved with a relative anchor.

Hundreds of tenants must **not** mean hundreds of copied scripts. Implemented (pure function, no registry):

```text
Vendor / App Family → Base Capability → App-Version Overlay → Tenant Override → Resolved Capability
```

Precedence: `base < version < tenant`. Unrelated tenants keep base/version. Invalid overlays fail validation. Immutable `id`+`version` is the unit of change.

**Drift (signals implemented, platform not):** fingerprint mismatch, primary-locator failure, fallback used, checkpoint degradation, replay failure → reliability review → rediscovery → new immutable version. Not LLM self-healing.

# 5. Escalation & handoff

Stuck, ambiguous, risky, or explicit-human conditions create an `InterventionRequest`, keep the **same** browser page, transfer `awaiting_human → human_control`, and audit human actions. Resume returns the controller to automation and rejoins the single replay finalization path (remaining steps, checkpoint, declared outputs). One controller at a time. Hosted takeover uses Browserbase Live View against that same remote `sessionId`; resume reconnects rather than creating a new session.

# 6. Safety

Policy is enforced at execution, not by the model: domain/route/action allowlists, fail-closed effect/risk (unknown state-changing clicks require human), post-navigation re-check, recursive log redaction. Recovery is not a bypass. Canonical SauceDemo policy is `saucedemo.com` only; localhost is fixture/test policy. Operator console is loopback-only. Unattended agent invocation is **approved-only**; `ALLOW_DRAFT_REPLAY` may unlock development/review replay of drafts but is ignored on the agent invoke path. Reliability counts are derived from replay evidence (no synthetic confidence score). `approvalReadiness` is advisory and never auto-approves.

# 7. Cuts

Depth of the Section 3 loop, not extra platforms:

| Omitted | Existing seam |
| --- | --- |
| Distributed workers / queues / K8s | Application ports (`discover` / `replay`); single process is intentional |
| Hosted browser as a production requirement | `BrowserSessionFactory` — Browserbase is one adapter; local Chromium remains the default |
| Tenant registry / admin UI | `resolveCapabilityVariant` + artifact overlays |
| Desktop / OS automation | `ComputerSurface` |
| Vision targeting | `LocatorKind.Vision` fails closed |
| SSO / production operator | Loopback intervention API |
| Secret vault | `bootstrapSession` / env fill; demo login is invocation input |
| Screenshot DLP | Redaction + evidence store; retention is operational |
| Drift dashboard | `DriftSignal` + `target.fallback_resolved` events |
| Playwright / page-object codegen | Capability JSON is the artifact; replay interprets it |
| LLM-assisted replay fallback | Replay never instantiates a `DiscoveryModel` |
| Full stability / N-run load service | Replay evidence counts only; no public-target load loops |
| Production approval workflow | Explicit status on the artifact; no auto draft→approved |

Canonical LLM evidence: Gemini `gemini-flash-latest`, `run_0ff1e4fec530` → `cart.add-product@v2`. Failed attempts live in `evidence/debug/` and are not proof. Hosted Vercel is a control plane: when Browserbase is healthy it runs the same discovery/replay/invoke/intervention services against a remote `ComputerSurface`; when it is not, health reports unavailable and the UI stays catalog-only. Hosted Browserbase execution is **implemented**, not live-verified in this repository (no `evidence/hosted/`). Browserbase is not a production requirement — it is one hosted browser adapter.
