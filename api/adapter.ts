/**
 * Vercel deployment adapter only (Node.js serverless — not Edge Runtime).
 * The API application lives under apps/api.
 * `node vercel-build.mjs` bundles this file to api/[...path].js (gitignored).
 */
export { default } from "../apps/api/src/interfaces/http/vercel-entry.js";
