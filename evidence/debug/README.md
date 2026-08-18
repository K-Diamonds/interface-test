# Debug discovery runs (not canonical)

These are classified failures from the live Gemini harness. They are **not** canonical LLM proof. The successful run is `evidence/discovery/canonical-llm-run/`.

## `run_fa0960ddfd33` — provider transport

Gemini’s OpenAI-compatible `chat/completions` proxy closed the response body (`Premature close`). Discovery failed closed (no scripted fallback). The live adapter now uses native `generateContent` with JSON mime type and retries transient 429/5xx/transport errors.

## `run_6295c514a4c6` — discovery policy

The model reached inventory and proposed an unlabeled in-domain click (`Add to cart`). Fail-closed unknown-click classification escalated to human. Replay still fail-closes unknown clicks; discovery allows unlabeled in-domain clicks so unattended exploration can proceed. Checkout-class / irreversible actions still require human.
