import { execSync } from "node:child_process";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", env: process.env, shell: true });
}

// Keep Vercel projectSettings.buildCommand short (Vercel hard limit).
// This script performs the same production build as vercel.json previously did.
// @browserbasehq/sdk is bundled (not --external) so health ping does not
// depend on tracing node_modules. playwright-core stays external because it
// ships native/CDP assets that esbuild cannot inline; Vercel resolves it from
// the pnpm workspace install (apps/api dependency).
run("pnpm --filter web build");
run(
  [
    "pnpm dlx esbuild@0.25.0 api/adapter.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--minify",
    "--banner:js='// GENERATED FILE — DO NOT EDIT.\\n// Source: api/adapter.ts\\n// Regenerate using: node vercel-build.mjs'",
    "--outfile='api/[...path].js'",
    "--footer:js='module.exports = module.exports.default || module.exports;'",
    "--external:playwright-core",
    "--external:playwright",
    "--external:chromium-bidi/*",
    "--external:fsevents",
    "--external:fsevents.node",
  ].join(" "),
);


