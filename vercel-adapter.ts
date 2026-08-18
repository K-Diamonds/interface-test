/**
 * Vercel deployment adapter only (Node.js serverless — not Edge Runtime).
 * Lives outside /api so Vercel does not compile this TypeScript as a second
 * function. `node vercel-build.mjs` bundles it to api/[...path].js.
 * The API application lives under apps/api.
 */
export { default } from "./apps/api/src/interfaces/http/vercel-entry.js";
