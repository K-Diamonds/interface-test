#!/usr/bin/env node
/**
 * Starts a live intervention session and the control-plane API.
 * Open the React client (or built UI) at the printed intervention URL.
 */
import { loadEnv, parseArgs } from "./args.js";
import { launchPlaywrightSurface } from "../../infrastructure/browser/playwright-surface.js";
import { SessionController } from "../../core/intervention/session-controller.js";
import {
  createInterventionRequest,
  persistIntervention,
} from "../../core/intervention/intervention.js";
import { registerLiveIntervention } from "../http/live-intervention.js";
import { createRunId } from "@cu/contracts";
import { EvidenceKind } from "@cu/contracts";
import { EvidenceStore } from "../../infrastructure/observability/evidence.js";
import { resolveApplicationProfile } from "../../profiles/registry.js";
import { resolveAutomationPolicy } from "../../core/policy/policy.js";
import { resolveRepoRoot } from "../../infrastructure/paths.js";

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const runId = createRunId();
  const evidence = await EvidenceStore.create(EvidenceKind.Intervention, runId, {
    repoRoot: resolveRepoRoot(),
  });
  const surface = await launchPlaywrightSurface({
    headless: args.headless ? true : false,
  });
  const session = new SessionController(runId);
  session.attachSurface(surface);
  session.start();

  const target = args.target as string | undefined;
  if (!target) {
    console.error("Usage: pnpm operator --target https://example.com");
    process.exit(2);
  }
  await surface.navigate(target);
  const shot = await surface.screenshot();
  const screenshotPath = await evidence.saveScreenshot(
    "before-escalation.png",
    shot,
  );
  const intervention = createInterventionRequest({
    runId,
    reason:
      (args.reason as string) ||
      "Operator demo — human controls the live session",
    screenshotPath,
    currentUrl: await surface.getCurrentLocation(),
    stateSummary: "Live session awaiting human (proxy demo app)",
  });
  await session.requestIntervention(intervention);
  await persistIntervention(evidence.dir, intervention);

  const profile = resolveApplicationProfile(target);
  const operatorPolicy = resolveAutomationPolicy({
    targetUrl: target,
    profile,
  });

  const server = await registerLiveIntervention({
    port: args.port ? Number(args.port) : undefined,
    session,
    intervention,
    operatorPolicy,
  });

  console.log("Control plane + live intervention ready.");
  console.log(`Intervention UI: ${server.url}`);
  console.log(`API:            http://127.0.0.1:${server.port}/api/health`);
  console.log("Keep this process running. Resume or Abort from the React UI.");

  const result = await session.waitForResume();
  console.log(`Session ended: ${result}`);
  await evidence.saveJson("human-actions.json", session.getHumanActions());
  await server.close();
  await surface.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
