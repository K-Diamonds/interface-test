This directory is the Vercel deployment adapter output only.

The API application lives under `apps/api/src/`. Do not add routes, replay,
discovery, Browserbase, or policy logic here.

- Source: `vercel-adapter.ts` (repo root — Vercel treats every `api/*.ts` file as a function)
- Generated at build: `api/[...path].js` via `node vercel-build.mjs`
- That generated bundle is gitignored. Never edit it.
