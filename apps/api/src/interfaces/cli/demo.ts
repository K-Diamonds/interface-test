#!/usr/bin/env node
/**
 * Canonical demo entrypoints:
 *   pnpm demo          — requires configured LLM (LIVE)
 *   pnpm demo:offline  — explicit scripted model (does NOT satisfy LLM evidence)
 */
import { discoverCapabilityApp } from "../../application/discover-capability.js";
import { replayCapabilityApp } from "../../application/replay-capability.js";
import { loadEnv, parseArgs } from "./args.js";
import { loadConfig } from "../../infrastructure/config.js";
import { AiProvider, DiscoveryRunStatus, ReplayExecutionContext } from "@cu/contracts";

async function main(): Promise<void> {
  loadEnv();
  const config = loadConfig({ reload: true });
  const args = parseArgs(process.argv.slice(2));
  const offline = Boolean(args.offline) || process.env.DEMO_MODE === "offline";

  console.log("══════════════════════════════════════════════");
  console.log(
    offline
      ? " OFFLINE SCRIPTED DEMO (not LLM evidence)"
      : " LIVE LLM DEMO",
  );
  console.log("══════════════════════════════════════════════\n");

  if (!offline) {
    if (config.ai.provider === AiProvider.OpenAI && !config.openai.apiKey) {
      console.error(
        "LIVE LLM MODE requires OPENAI_API_KEY (or AI_PROVIDER=gemini with GEMINI_API_KEY).\n" +
          "Use: pnpm demo:offline for scripted architecture exercise.",
      );
      process.exit(2);
    }
    if (config.ai.provider === AiProvider.Gemini && !config.gemini.apiKey) {
      console.error(
        "LIVE LLM MODE requires GEMINI_API_KEY when AI_PROVIDER=gemini.\n" +
          "Use: pnpm demo:offline for scripted architecture exercise.",
      );
      process.exit(2);
    }
  }

  const goal =
    "Add Sauce Labs Backpack to the cart and reach the cart page";
  const target = "https://www.saucedemo.com";
  const { resolveApplicationProfile } = await import(
    "../../profiles/registry.js"
  );
  const profile = resolveApplicationProfile(target);
  const parameters = profile?.resolveInvocationParameters?.({
    parameters: { productName: "Sauce Labs Backpack" },
    getenv: (k) => process.env[k],
  }) ?? {
    productName: "Sauce Labs Backpack",
  };

  console.log("1) Discovery…");
  const discovery = await discoverCapabilityApp({
    goal,
    target,
    headless: true,
    scripted: offline,
    parameters,
  });
  console.log(`   status=${discovery.status} run=${discovery.runId}`);
  if (discovery.capabilityPath) {
    console.log(`   capability=${discovery.capabilityPath}`);
  }
  if (discovery.status !== DiscoveryRunStatus.Completed || !discovery.artifact) {
    console.error(`Discovery failed: ${discovery.reason ?? discovery.status}`);
    process.exit(1);
  }
  console.log("");

  console.log("2) Deterministic replay of discovered artifact (NO LLM)…");
  const success = await replayCapabilityApp({
    capabilityId: discovery.artifact.capability.id,
    version: discovery.artifact.capability.version,
    inputs: parameters,
    executionContext: ReplayExecutionContext.Review,
    allowDraft: true,
    options: { headless: true },
  });
  console.log(`   status=${success.status} run=${success.runId}`);
  console.log("");

  console.log("3) Business outcome (missing product)…");
  const missing = await replayCapabilityApp({
    capabilityId: discovery.artifact.capability.id,
    version: discovery.artifact.capability.version,
    inputs: {
      ...parameters,
      productName: "THIS PRODUCT DOES NOT EXIST",
    },
    executionContext: ReplayExecutionContext.Review,
    allowDraft: true,
    options: { headless: true },
  });
  console.log(`   status=${missing.status} run=${missing.runId}`);
  console.log("");

  console.log("Demo finished.");
  if (success.status !== "success") process.exit(1);
  if (missing.status !== "business_outcome") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
