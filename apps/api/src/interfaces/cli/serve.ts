#!/usr/bin/env node
import { loadEnv, parseArgs } from "./args.js";
import { startControlPlaneServer } from "../http/server.js";

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const port = args.port ? Number(args.port) : undefined;
  const handle = await startControlPlaneServer({ port });
  console.log(`Control plane API listening on ${handle.url}`);
  console.log("API: /api/capabilities /api/runs /api/interventions /api/health");
  if (process.env.SERVE_WEB === "1") {
    console.log("UI:  served from apps/web/dist on this port (SERVE_WEB=1)");
  } else {
    console.log("UI:  http://127.0.0.1:5173  (pnpm --filter web dev) — open that URL only");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
