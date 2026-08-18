#!/usr/bin/env node
/**
 * Real agent-facing invocation evidence (zero LLM).
 * Uses the local interstitial fixture so we do not hit SauceDemo.
 *
 *   pnpm evidence:agent-invoke
 */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { invokeAgentCapability } from "../../application/agent-invoke.js";
import { loadEnv } from "./args.js";
import { resolveRepoRoot } from "../../infrastructure/paths.js";

async function main(): Promise<void> {
  loadEnv();
  const root = resolveRepoRoot();
  const fixture = path.join(
    root,
    "apps/api/fixtures/recoverable-interstitial.html",
  );
  const html = await readFile(fixture);

  const server = createServer((req, res) => {
    if (req.url?.includes("recoverable-interstitial")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const baseUrl = await new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("bind failed");
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });

  const request = {
    arguments: { baseUrl },
  };

  try {
    const result = await invokeAgentCapability({
      capabilityId: "session.dismiss-interstitial",
      version: 1,
      arguments: request.arguments,
    });

    const dest = path.join(root, "evidence", "agent-invocation", "canonical");
    await mkdir(dest, { recursive: true });
    await writeFile(
      path.join(dest, "request.json"),
      JSON.stringify(request, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(dest, "result.json"),
      JSON.stringify(result, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(dest, "metadata.json"),
      JSON.stringify(
        {
          capabilityId: "session.dismiss-interstitial",
          capabilityVersion: 1,
          runId: result.runId,
          llmDecisionCount: 0,
          path: "POST /api/agent/capabilities/:id/versions/:version/invoke",
          target: "local-fixture",
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    console.log(`status=${result.status} run=${result.runId}`);
    console.log(`wrote ${dest}`);
    if (result.status !== "success") process.exitCode = 1;
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
