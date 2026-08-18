# Web — Computer Use control plane

React + Vite operator UI. Talks only to the control-plane HTTP API.

## Run

```bash
# terminal 1 — API (JSON only on :8787)
pnpm --filter api dev

# terminal 2 — this app
pnpm --filter web dev
# → http://127.0.0.1:5173   ← open this URL only
```

Vite proxies `/api` → `http://127.0.0.1:8787`. Do not use `:8787` as a second UI.

Routes are addressable, e.g. `/runs/run_abc`, `/capabilities/cart.add-product/versions/1`, `/interventions/:id`.

## Live handoff

```bash
pnpm operator --target https://www.saucedemo.com
# prints Intervention UI URL — open it on :5173
```
