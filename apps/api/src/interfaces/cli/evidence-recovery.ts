#!/usr/bin/env node
/**
 * Deterministic recoverable-condition evidence (zero LLM).
 * Serves a local interstitial fixture, replays session.dismiss-interstitial@v1.
 */
import { createServer } from "node:http";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { replayCapabilityApp } from "../../application/replay-capability.js";
import { loadEnv } from "./args.js";
import { resolveRepoRoot } from "../../infrastructure/paths.js";
import { ExecutionResultStatus } from "@cu/contracts";

async function copyIfExists(from: string, to: string): Promise<void> {
  try {
    await copyFile(from, to);
  } catch {
    // optional
  }
}

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

  try {
    const result = await replayCapabilityApp({
      capabilityId: "session.dismiss-interstitial",
      version: 1,
      inputs: { baseUrl },
      options: { headless: true },
    });
    console.log(`status=${result.status} run=${result.runId}`);
    if (result.status !== ExecutionResultStatus.Success) {
      process.exitCode = 1;
      return;
    }

    const dest = path.join(root, "evidence", "replay", "recoverable-condition");
    await mkdir(dest, { recursive: true });
    const src = path.join(root, "evidence", "replay", result.runId);
    for (const name of [
      "events.jsonl",
      "start.png",
      "final.png",
      "exceptional.png",
      "after-recovery.png",
      "trace.zip",
    ]) {
      await copyIfExists(path.join(src, name), path.join(dest, name));
    }
    await copyIfExists(
      path.join(src, "after-recovery.png"),
      path.join(dest, "recovered.png"),
    );
    await writeFile(
      path.join(dest, "result.json"),
      JSON.stringify(
        {
          status: result.status,
          runId: result.runId,
          capabilityId: "session.dismiss-interstitial",
          capabilityVersion: 1,
          llmDecisionCount: 0,
          outputs: result.status === ExecutionResultStatus.Success ? result.outputs : {},
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      path.join(dest, "metadata.json"),
      JSON.stringify(
        {
          mode: "replay",
          llmDecisionCount: 0,
          capabilityId: "session.dismiss-interstitial",
          capabilityVersion: 1,
          replayRunId: result.runId,
          status: result.status,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`promoted ${dest}`);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
