import { execSync } from "node:child_process";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", env: process.env, shell: true });
}

// Keep Vercel projectSettings.buildCommand short (Vercel hard limit).
// Vite-only here: CI already typechecks. Vercel's install can hoist a
// different Zod and fail `tsc` even when local typecheck passes.
run("pnpm --filter web exec vite build");
run(
  [
    "pnpm dlx esbuild@0.25.0 vercel-adapter.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--minify",
    "--banner:js='// GENERATED FILE — DO NOT EDIT.\\n// Source: vercel-adapter.ts\\n// Regenerate using: node vercel-build.mjs'",
    "--outfile='api/[...path].js'",
    "--footer:js='module.exports = module.exports.default || module.exports;'",
    "--external:playwright-core",
    "--external:playwright",
    "--external:chromium-bidi/*",
    "--external:fsevents",
    "--external:fsevents.node",
  ].join(" "),
);
