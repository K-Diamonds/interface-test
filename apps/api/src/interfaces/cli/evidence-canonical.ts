#!/usr/bin/env node
/**
 * Canonical evidence chain (LIVE LLM required — OpenAI or Gemini):
 *   discovery → capability artifact → load from disk → deterministic replay
 *   → evidence/discovery/canonical-llm-run + evidence/replay/canonical-success
 *
 * Never uses SauceDemoScriptedModel. Never silently falls back.
 *
 * Usage:
 *   AI_PROVIDER=gemini GEMINI_API_KEY=... pnpm evidence:canonical
 *   AI_PROVIDER=openai OPENAI_API_KEY=... pnpm evidence:canonical
 */
import { mkdir, copyFile, writeFile, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  AiProvider,
  DiscoveryMode,
  DiscoveryRunStatus,
  ExecutionResultStatus,
  RunMode,
  ReplayExecutionContext,
} from "@cu/contracts";
import { discoverCapabilityApp } from "../../application/discover-capability.js";
import { replayCapabilityApp } from "../../application/replay-capability.js";
import { loadEnv } from "./args.js";
import { loadConfig } from "../../infrastructure/config.js";
import { resolveRepoRoot } from "../../infrastructure/paths.js";
import { redactValue } from "../../core/policy/redaction.js";

const CANONICAL_GOAL =
  "Add the product specified by productName to the cart and reach the cart review page.";
const TARGET = "https://www.saucedemo.com";

async function findRunDir(root: string, runId: string): Promise<string | null> {
  const base = path.join(root, "evidence");
  const kinds = await readdir(base).catch(() => []);
  for (const kind of kinds) {
    const p = path.join(base, kind, runId);
    try {
      if ((await stat(p)).isDirectory()) return p;
    } catch {
      // continue
    }
  }
  return null;
}

async function copyIfExists(from: string, to: string): Promise<boolean> {
  try {
    await copyFile(from, to);
    return true;
  } catch {
    return false;
  }
}

async function writeEvidenceJson(file: string, data: unknown): Promise<void> {
  await writeFile(
    file,
    JSON.stringify(redactValue(data), null, 2) + "\n",
    "utf8",
  );
}

async function main(): Promise<void> {
  loadEnv();
  const config = loadConfig({ reload: true });
  const root = resolveRepoRoot();

  const live =
    config.ai.provider === AiProvider.Gemini && config.gemini.apiKey
      ? { provider: AiProvider.Gemini, model: config.gemini.model }
      : config.ai.provider === AiProvider.OpenAI && config.openai.apiKey
        ? { provider: AiProvider.OpenAI, model: config.openai.model }
        : null;
  if (!live) {
    console.error(
      "Canonical LLM evidence requires a live cloud provider:\n" +
        "  AI_PROVIDER=gemini and GEMINI_API_KEY, or\n" +
        "  AI_PROVIDER=openai and OPENAI_API_KEY.\n" +
        "Ollama/scripted runs are NOT promoted as canonical.",
    );
    process.exit(2);
  }

  const parameters = { productName: "Sauce Labs Backpack" };

  console.log("1) LIVE LLM discovery…");
  console.log(`   provider=${live.provider} model=${live.model}`);
  console.log(`   goal=${CANONICAL_GOAL}`);

  const discovery = await discoverCapabilityApp({
    goal: CANONICAL_GOAL,
    target: TARGET,
    parameters,
    headless: true,
    scripted: false,
    maxSteps: 25,
    timeoutSeconds: 300,
  });

  if (
    discovery.status !== DiscoveryRunStatus.Completed ||
    !discovery.artifact ||
    !discovery.capabilityPath
  ) {
    console.error(
      `Discovery failed: ${discovery.status} ${discovery.reason ?? ""}`,
    );
    console.error(
      `Evidence left under evidence/ (run ${discovery.runId}) — not canonical.`,
    );
    process.exit(1);
  }

  const artifact = discovery.artifact;
  console.log(`   run=${discovery.runId}`);
  console.log(
    `   capability=${artifact.capability.id}@v${artifact.capability.version}`,
  );
  console.log(`   path=${discovery.capabilityPath}`);

  if (artifact.metadata.discoveredFromRunId !== discovery.runId) {
    console.error(
      `Provenance mismatch: discoveredFromRunId=${artifact.metadata.discoveredFromRunId} vs run=${discovery.runId}`,
    );
    process.exit(1);
  }

  const credentialInputs = {
    username: process.env.SAUCE_USERNAME ?? "standard_user",
    password: process.env.SAUCE_PASSWORD ?? "secret_sauce",
  };
  const inputs = {
    productName: "Sauce Labs Backpack",
    ...credentialInputs,
  };

  // Prove replay does not need an LLM: strip model credentials for the replay phase.
  const savedOpenAiKey = process.env.OPENAI_API_KEY;
  const savedGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  loadConfig({ reload: true });

  console.log(
    "2) Load persisted artifact from capability repository + deterministic replay (NO LLM)…",
  );
  const replay = await replayCapabilityApp({
    capabilityId: artifact.capability.id,
    version: artifact.capability.version,
    inputs,
    executionContext: ReplayExecutionContext.Review,
    allowDraft: true,
    options: { headless: true },
  });
  console.log(`   status=${replay.status} run=${replay.runId}`);

  if (replay.status !== ExecutionResultStatus.Success) {
    if (savedOpenAiKey !== undefined) process.env.OPENAI_API_KEY = savedOpenAiKey;
    if (savedGeminiKey !== undefined) process.env.GEMINI_API_KEY = savedGeminiKey;
    loadConfig({ reload: true });
    console.error("Replay did not succeed — refusing to promote canonical evidence.");
    process.exit(1);
  }

  // Optional parameterization proof (same artifact, different product)
  console.log("3) Same artifact, different productName (parameterization)…");
  const altReplay = await replayCapabilityApp({
    capabilityId: artifact.capability.id,
    version: artifact.capability.version,
    inputs: {
      productName: "Sauce Labs Bike Light",
      ...credentialInputs,
    },
    executionContext: ReplayExecutionContext.Review,
    allowDraft: true,
    options: { headless: true },
  });
  console.log(`   status=${altReplay.status} run=${altReplay.runId}`);

  console.log("4) Same artifact, missing product (business outcome)…");
  const outcomeReplay = await replayCapabilityApp({
    capabilityId: artifact.capability.id,
    version: artifact.capability.version,
    inputs: {
      productName: "PRODUCT THAT DOES NOT EXIST",
      ...credentialInputs,
    },
    executionContext: ReplayExecutionContext.Review,
    allowDraft: true,
    options: { headless: true },
  });
  console.log(`   status=${outcomeReplay.status} run=${outcomeReplay.runId}`);
  if (outcomeReplay.status === "business_outcome") {
    console.log(`   outcome=${outcomeReplay.outcome.code}`);
  }

  if (savedOpenAiKey !== undefined) process.env.OPENAI_API_KEY = savedOpenAiKey;
  if (savedGeminiKey !== undefined) process.env.GEMINI_API_KEY = savedGeminiKey;
  loadConfig({ reload: true });

  const discoveryDest = path.join(
    root,
    "evidence",
    "discovery",
    "canonical-llm-run",
  );
  await mkdir(discoveryDest, { recursive: true });

  const srcDir = await findRunDir(root, discovery.runId);
  if (!srcDir) {
    console.error(`Could not locate evidence for ${discovery.runId}`);
    process.exit(1);
  }

  for (const name of ["events.jsonl", "start.png", "final.png", "trace.zip"]) {
    const ok = await copyIfExists(
      path.join(srcDir, name),
      path.join(discoveryDest, name),
    );
    if (!ok) console.warn(`  missing optional ${name}`);
  }

  const capSrc = path.join(root, discovery.capabilityPath);
  await copyFile(capSrc, path.join(discoveryDest, "generated-capability.json"));

  const eventsRaw = await readFile(
    path.join(srcDir, "events.jsonl"),
    "utf8",
  ).catch(() => "");
  const first = eventsRaw.split("\n").find((l) => l.includes("run.started"));
  let provider: string = live.provider;
  let model = live.model;
  try {
    if (first) {
      const ev = JSON.parse(first) as { provider?: string; model?: string };
      if (ev.provider) provider = ev.provider;
      if (ev.model) model = ev.model;
    }
  } catch {
    // ignore
  }

  const discoveryMeta = {
    mode: RunMode.Discovery,
    discoveryMode: DiscoveryMode.Llm,
    provider,
    model,
    runId: discovery.runId,
    goal: CANONICAL_GOAL,
    target: TARGET,
    timestamp: new Date().toISOString(),
    status: ExecutionResultStatus.Success,
    capabilityId: artifact.capability.id,
    capabilityVersion: artifact.capability.version,
    capabilityPath: discovery.capabilityPath,
    replayRunId: replay.runId,
    discoveredFromRunId: artifact.metadata.discoveredFromRunId,
    parameterizationRunId:
      altReplay.status === ExecutionResultStatus.Success ? altReplay.runId : undefined,
    businessOutcomeRunId:
      outcomeReplay.status === "business_outcome"
        ? outcomeReplay.runId
        : undefined,
  };
  await writeEvidenceJson(path.join(discoveryDest, "metadata.json"), discoveryMeta);

  await writeFile(
    path.join(discoveryDest, "README.md"),
    `# Canonical LLM discovery

Provider: ${provider}
Model: ${model}
Run ID: ${discovery.runId}
Status: Success

This run is a genuine LLM-driven observe → decide → act execution against the live SauceDemo surface.

It generated:
\`${discovery.capabilityPath}\`

Replay of that artifact (zero LLM decisions): \`${replay.runId}\`
`,
  );

  const replayDest = path.join(
    root,
    "evidence",
    "replay",
    "canonical-success",
  );
  await mkdir(replayDest, { recursive: true });
  const replaySrc = await findRunDir(root, replay.runId);
  if (replaySrc) {
    for (const name of ["events.jsonl", "final.png", "trace.zip", "start.png"]) {
      await copyIfExists(
        path.join(replaySrc, name),
        path.join(replayDest, name),
      );
    }
  }

  const resultJson = {
    status: replay.status,
    runId: replay.runId,
    capabilityId: artifact.capability.id,
    capabilityVersion: artifact.capability.version,
    outputs: replay.status === ExecutionResultStatus.Success ? replay.outputs : undefined,
    llmDecisionCount: 0,
  };
  await writeEvidenceJson(path.join(replayDest, "result.json"), resultJson);
  await writeEvidenceJson(path.join(replayDest, "metadata.json"), {
    mode: RunMode.Replay,
    llmDecisionCount: 0,
    discoveryRunId: discovery.runId,
    replayRunId: replay.runId,
    capabilityId: artifact.capability.id,
    capabilityVersion: artifact.capability.version,
    status: ExecutionResultStatus.Success,
  });

  if (altReplay.status === ExecutionResultStatus.Success) {
    const altDest = path.join(
      root,
      "evidence",
      "replay",
      "canonical-alt-product",
    );
    await mkdir(altDest, { recursive: true });
    await writeEvidenceJson(path.join(altDest, "metadata.json"), {
      mode: RunMode.Replay,
      llmDecisionCount: 0,
      discoveryRunId: discovery.runId,
      replayRunId: altReplay.runId,
      capabilityId: artifact.capability.id,
      capabilityVersion: artifact.capability.version,
      inputs: { productName: "Sauce Labs Bike Light" },
      status: ExecutionResultStatus.Success,
    });
    if (altReplay.status === ExecutionResultStatus.Success) {
      await writeEvidenceJson(path.join(altDest, "result.json"), {
        status: altReplay.status,
        runId: altReplay.runId,
        outputs: altReplay.outputs,
      });
    }
  }

  if (outcomeReplay.status === "business_outcome") {
    const outDest = path.join(
      root,
      "evidence",
      "replay",
      "business-outcome",
    );
    await mkdir(outDest, { recursive: true });
    await writeEvidenceJson(path.join(outDest, "metadata.json"), {
      mode: RunMode.Replay,
      llmDecisionCount: 0,
      discoveryRunId: discovery.runId,
      replayRunId: outcomeReplay.runId,
      capabilityId: artifact.capability.id,
      capabilityVersion: artifact.capability.version,
      status: ExecutionResultStatus.BusinessOutcome,
      outcome: outcomeReplay.outcome,
    });
  }

  console.log("\nCanonical evidence promoted:");
  console.log(`  ${discoveryDest}`);
  console.log(`  ${replayDest}`);
  console.log(
    `  capability ${artifact.capability.id}@v${artifact.capability.version}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
