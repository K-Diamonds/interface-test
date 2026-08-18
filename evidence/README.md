# Evidence

Reviewer map. Each requirement points at exactly one canonical directory.

> Offline scripted mode exists only to exercise the architecture without model access.
> It does **not** satisfy the assignment's required genuine LLM discovery evidence.

| Requirement | Canonical path | Status |
| --- | --- | --- |
| Genuine LLM discovery | [`discovery/canonical-llm-run/`](./discovery/canonical-llm-run/) | Recorded (Gemini `gemini-flash-latest`, run `run_0ff1e4fec530` → `cart.add-product@v2`) |
| Deterministic replay | [`replay/canonical-success/`](./replay/canonical-success/) | Recorded (`llmDecisionCount = 0`) |
| Alternative parameter | [`replay/canonical-alt-product/`](./replay/canonical-alt-product/) | Recorded (Bike Light) |
| Business outcome | [`replay/business-outcome/`](./replay/business-outcome/) | Recorded (`PRODUCT_NOT_FOUND`) |
| Recoverable condition | [`replay/recoverable-condition/`](./replay/recoverable-condition/) | Recorded (`session.dismiss-interstitial@v1`) |
| Hard failure | [`replay/hard-failure/`](./replay/hard-failure/) | Recorded |
| Same-session intervention | [`intervention/same-session-handoff/`](./intervention/same-session-handoff/) | Recorded (local Playwright) |
| Agent invocation | [`agent-invocation/canonical/`](./agent-invocation/canonical/) | Recorded (local fixture, `llmDecisionCount = 0`) |
| Hosted Vercel + Browserbase | `hosted/` | **Not live-verified.** Implemented in source; no authentic hosted run has been captured. |

Do not treat `evidence/offline-demo/` or `evidence/debug/` as canonical LLM proof.

---

## 1. Genuine LLM discovery

**Path:** `evidence/discovery/canonical-llm-run/`

Generate with:

```bash
AI_PROVIDER=gemini GEMINI_API_KEY=… GEMINI_MODEL=gemini-flash-latest pnpm evidence:canonical
```

Requires a live cloud LLM key with remaining quota. Provider/auth/quota failures fail the run as `failed` (not “invalid actions”) and are not promoted.

Required contents after a successful run:

```text
metadata.json
events.jsonl
start.png
final.png
trace.zip
generated-capability.json
README.md
```

Proves live LLM observe/decide/act, successful UI completion, artifact from the successful trace, and a linked zero-LLM replay of that same artifact.

Failed LLM experiments live under `evidence/debug/` and are **not** canonical.

**Path:** `evidence/debug/`

| Run | What it shows |
| --- | --- |
| `run_fa0960ddfd33` | Gemini OpenAI-compat transport closed the body; discovery failed closed |
| `run_6295c514a4c6` | Unknown in-domain click escalated during discovery before policy was made exploration-capable |

## 2. Deterministic replay

**Path:** `evidence/replay/canonical-success/`

Same generated artifact (`cart.add-product@v2`), zero LLM decisions, typed outputs + final checkpoint (`llmDecisionCount = 0`). Original run id: `run_dc19aab86ad6`.

## 3. Alternative parameter replay

**Path:** `evidence/replay/canonical-alt-product/`

Same artifact, different `productName` (Bike Light). Original run id: `run_ccf42a118930`.

## 4. Business outcome

**Path:** `evidence/replay/business-outcome/`

Declared known-outcome detection (`PRODUCT_NOT_FOUND`) — not a hard crash. Original run id: `run_222491fd300e`.

## 5. Recoverable runtime condition

**Path:** `evidence/replay/recoverable-condition/`

Generate with:

```bash
pnpm evidence:recovery
```

Zero LLM. A local interstitial fixture is served, `session.dismiss-interstitial@v1` declares a `known_interstitial` recovery rule, policy allows the dismiss control, the original checkpoint then succeeds.

Expected files: `metadata.json`, `events.jsonl`, `result.json`, `start.png`, `exceptional.png`, `after-recovery.png` / `recovered.png`, `final.png`, `trace.zip`.

Expected event sequence:

```text
exceptional_state.detected
recovery.started
policy.allowed
recovery.action_executed
recovery.completed
checkpoint.satisfied
run.completed
```

## 6. Hard failure

Fixture capability under `artifacts/capabilities/cart.add-product.hardfail/` with evidence under `evidence/replay/hard-failure/`.

## 7. Same-session human intervention

**Path:** `evidence/intervention/same-session-handoff/`

Proves one controller at a time on the live Playwright session.

## 8. Agent-facing invocation

**Path:** `evidence/agent-invocation/canonical/`

Zero-LLM invoke of the approved local fixture `session.dismiss-interstitial@v1` through `invokeAgentCapability` (same replay engine). Generated with `pnpm evidence:agent-invoke`. Does **not** hammer SauceDemo.

```text
request.json
result.json
metadata.json   # capabilityId, capabilityVersion, runId, llmDecisionCount = 0
```

The SauceDemo agent contract is the same HTTP surface:

`POST /api/agent/capabilities/cart.add-product/versions/2/invoke`

## 9. Hosted execution

**Implemented** in source: Vercel control plane → Browserbase `ComputerSurface` when `GET /api/health` reports `browserRuntime=available`.

**Live verified:** no. There is no `evidence/hosted/` directory. Do not treat the production UI as proof of hosted Browserbase execution until a real hosted run is promoted here.

## Offline / architecture exercise

**Path:** `evidence/offline-demo/scripted-discovery/`

Scripted discovery for CI and reviewers without LLM credentials.
Label: **not** LLM evidence.
