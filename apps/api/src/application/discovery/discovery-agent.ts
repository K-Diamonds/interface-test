import { DiscoveryRunStatus, ResumeWaitResult } from "@cu/contracts";
import path from "node:path";
import { resolveAutomationPolicy } from "../../core/policy/policy.js";
import { Logger } from "../../infrastructure/observability/logger.js";
import { EvidenceStore } from "../../infrastructure/observability/evidence.js";
import { SessionController } from "../../core/intervention/session-controller.js";
import {
  createInterventionRequest,
  persistIntervention,
} from "../../core/intervention/intervention.js";
import { registerLiveIntervention } from "../../interfaces/http/live-intervention.js";
import {
  DiscoveryMode,
  EvidenceKind,
  LoggerMode,
} from "@cu/contracts";
import { createRunId } from "@cu/contracts";
import { ValidationError } from "../../core/errors.js";
import {
  LiveLlmDiscoveryModel,
  type DiscoveryModel,
} from "./discovery-model.js";
import { runAgentLoop } from "./agent-loop.js";
import { buildCapabilityFromDiscovery } from "../../core/capability/compiler/capability-compiler.js";
import { CapabilityStore } from "../../core/capability/capability-store.js";
import type { CapabilityArtifact } from "@cu/contracts";
import { resolveRepoRoot } from "../../infrastructure/paths.js";
import { resolveApplicationProfile } from "../../profiles/registry.js";
import { UnverifiedGoalVerifier } from "../../core/domain/application-profile.js";
import { createRuntimeSessionFactory } from "../../infrastructure/runtime.js";
import type { BrowserSessionFactory } from "../../infrastructure/browser/session-factory.js";
import { createHostedSessionRegistry } from "../../infrastructure/persistence/hosted-session-registry.js";
import { Controller, SessionExecutionState } from "@cu/contracts";

export interface DiscoverOptions {
  goal: string;
  target: string;
  headless?: boolean;
  maxSteps?: number;
  timeoutMs?: number;
  model?: DiscoveryModel;
  enableOperator?: boolean;
  rootDir?: string;
  stuckThreshold?: number;
  /** Generic invocation parameters declared by the discovery contract. */
  parameters?: Record<string, unknown>;
  discoveryMode?: DiscoveryMode;
  modelName?: string;
  /** Evidence provenance — openai | ollama | scripted */
  provider?: string;
  evidenceKind?: typeof EvidenceKind.Discovery | typeof EvidenceKind.OfflineDemo;
  sessionFactory?: BrowserSessionFactory;
  runId?: string;
  reconnectSessionId?: string;
}

export interface DiscoverResult {
  runId: string;
  status: DiscoveryRunStatus;
  capabilityPath?: string;
  artifact?: CapabilityArtifact;
  outputs: Record<string, unknown>;
  reason?: string;
  operatorUrl?: string;
}

export async function runDiscovery(
  options: DiscoverOptions,
): Promise<DiscoverResult> {
  const runId = options.runId ?? createRunId();
  const rootDir = options.rootDir ?? resolveRepoRoot();
  const evidenceKind = options.evidenceKind ?? EvidenceKind.Discovery;
  const evidence = await EvidenceStore.create(evidenceKind, runId, {
    repoRoot: rootDir,
  });
  const logger = await Logger.create(runId, LoggerMode.Discovery, evidence.dir);
  const session = new SessionController(runId);
  const parameters = { ...(options.parameters ?? {}) };
  const profile = resolveApplicationProfile(options.target);
  const contract = profile?.discoveryContract({
    goal: options.goal,
    parameters,
    startUrl: options.target,
  });
  const policy = resolveAutomationPolicy({
    targetUrl: options.target,
    profile,
  });

  const factory =
    options.sessionFactory ?? (await createRuntimeSessionFactory());
  const handle = options.reconnectSessionId && factory.reconnect
    ? await factory.reconnect(options.reconnectSessionId)
    : await factory.create({
        headless: options.headless ?? true,
        tracesDir: evidence.dir,
        runId,
      });
  const surface = handle.surface;
  session.attachSurface(surface);
  session.start();

  if (handle.externalSessionId) {
    await logger.log("session.attached", {
      summary: handle.externalSessionId,
      externalSessionId: handle.externalSessionId,
      phase: "created",
    });
    await createHostedSessionRegistry()
      .put({
        runId,
        externalSessionId: handle.externalSessionId,
        controller: Controller.Automation,
        executionState: SessionExecutionState.Running,
        mode: "discovery",
        discovery: {
          discoveryMode:
            options.discoveryMode ?? DiscoveryMode.Llm,
          provider: options.provider ?? "unknown",
          modelName: options.modelName ?? "unknown",
          parameters,
          goal: options.goal,
          target: options.target,
        },
        goal: options.goal,
        target: options.target,
        updatedAt: new Date().toISOString(),
      })
      .catch(() => undefined);
  }

  if (!options.model) {
    throw new ValidationError(
      "runDiscovery requires an explicit discovery model",
    );
  }
  const model = options.model;
  const discoveryMode =
    options.discoveryMode ??
    (model instanceof LiveLlmDiscoveryModel
      ? DiscoveryMode.Llm
      : DiscoveryMode.Scripted);
  const modelName =
    options.modelName ??
    (discoveryMode === DiscoveryMode.Llm
      ? process.env.OPENAI_MODEL ??
        process.env.GEMINI_MODEL ??
        process.env.OLLAMA_MODEL ??
        "unknown"
      : "scripted-offline");

  await logger.log("run.started", {
    summary: options.goal,
    goal: options.goal,
    actor: "automation",
    discoveryMode,
    provider:
      options.provider ??
      (model instanceof LiveLlmDiscoveryModel
        ? model.providerLabel
        : "scripted"),
    model: modelName,
    target: options.target,
    parameters: Object.keys(parameters),
  });

  try {
    if (options.reconnectSessionId) {
      await logger.log("session.reconnected", {
        summary: handle.externalSessionId,
        externalSessionId: handle.externalSessionId,
        phase: "resuming",
      });
    } else if (profile?.bootstrapSession) {
      await profile.bootstrapSession({ surface, parameters });
    } else {
      await surface.navigate(options.target);
    }
    const startShot = await surface.screenshot();
    await evidence.saveScreenshot("start.png", startShot);

    const goalVerifier =
      (contract && profile?.createGoalVerifier?.(contract)) ??
      UnverifiedGoalVerifier;

    const loopResult = await runAgentLoop({
      goal: options.goal,
      surface,
      model,
      policy,
      session,
      logger,
      evidence,
      maxSteps: options.maxSteps ?? 25,
      timeoutMs: options.timeoutMs ?? 240_000,
      stuckThreshold: options.stuckThreshold ?? 3,
      parameters,
      goalVerifier,
    });

    if (loopResult.status === "intervention_required") {
      const shot = await surface.screenshot();
      const screenshotPath = await evidence.saveScreenshot(
        "before-escalation.png",
        shot,
      );
      const intervention = createInterventionRequest({
        runId,
        reason: loopResult.reason ?? "Intervention required",
        goal: options.goal,
        screenshotPath,
        currentUrl: await surface.getCurrentLocation(),
        stateSummary: loopResult.reason ?? "stuck",
      });
      await session.requestIntervention(intervention);
      await persistIntervention(evidence.dir, intervention);

      if (options.enableOperator) {
        const server = await registerLiveIntervention({
          session,
          intervention,
          operatorPolicy: policy,
        });
        console.log(`Operator console: ${server.url}`);
        const wait = await session.waitForResume();
        await server.close();
        if (wait === ResumeWaitResult.Aborted) {
          session.fail();
          await handle.terminate().catch(() => undefined);
          return {
            runId,
            status: DiscoveryRunStatus.Failed,
            outputs: loopResult.outputs,
            reason: "Aborted during intervention",
            operatorUrl: server.url,
          };
        }
      } else {
        if (handle.externalSessionId) {
          await logger.log("session.handoff", {
            summary: handle.externalSessionId,
            externalSessionId: handle.externalSessionId,
            phase: "awaiting_human",
            interventionId: intervention.id,
          });
          await createHostedSessionRegistry()
            .put({
              runId,
              externalSessionId: handle.externalSessionId,
              controller: Controller.Human,
              executionState: SessionExecutionState.HumanControl,
              interventionId: intervention.id,
              mode: "discovery",
              discovery: {
                discoveryMode,
                provider: options.provider ?? "unknown",
                modelName,
                parameters,
                goal: options.goal,
                target: options.target,
              },
              goal: options.goal,
              target: options.target,
              updatedAt: new Date().toISOString(),
            })
            .catch(() => undefined);
        }
        await handle.disconnect().catch(() => undefined);
        return {
          runId,
          status: DiscoveryRunStatus.InterventionRequired,
          outputs: loopResult.outputs,
          reason: loopResult.reason,
        };
      }
    }

    if (loopResult.status === DiscoveryRunStatus.Failed) {
      session.fail();
      const shot = await surface.screenshot().catch(() => null);
      if (shot) await evidence.saveScreenshot("failure.png", shot);
      await handle.terminate().catch(() => undefined);
      await createHostedSessionRegistry().delete(runId).catch(() => undefined);
      return {
        runId,
        status: DiscoveryRunStatus.Failed,
        outputs: loopResult.outputs,
        reason: loopResult.reason,
      };
    }

    if (!contract) {
      throw new ValidationError(
        `No discovery contract for target ${options.target}. Register an ApplicationProfile.`,
      );
    }

    await logger.log("capability.compilation_started", {
      summary: "Compiling successful discovery trace into capability artifact",
    });

    const artifact = buildCapabilityFromDiscovery({
      goal: options.goal,
      runId,
      steps: loopResult.steps,
      outputs: loopResult.outputs,
      policy,
      startUrl: options.target,
      contract,
      applicationProfile: profile,
      parameters,
    });

    const store = new CapabilityStore(rootDir);
    const versions = await store.listVersions(artifact.capability.id);
    if (versions.length > 0) {
      artifact.capability.version = Math.max(...versions) + 1;
    }
    // Discovery-produced capabilities remain draft; production replay should require approved.
    artifact.capability.status = "draft";
    const capabilityPath = await store.save(artifact);

    if (surface.stopTracing) {
      await surface.stopTracing(path.join(evidence.dir, "trace.zip"));
    }

    const finalShot = await surface.screenshot().catch(() => null);
    if (finalShot) await evidence.saveScreenshot("final.png", finalShot);

    await logger.log("capability.compiled", {
      summary: capabilityPath,
      capabilityId: artifact.capability.id,
      version: artifact.capability.version,
    });

    session.complete();
    await logger.log("run.completed", {
      summary: `Capability written: ${capabilityPath}`,
    });
    await handle.terminate().catch(() => undefined);
    await createHostedSessionRegistry().delete(runId).catch(() => undefined);

    return {
      runId,
      status: DiscoveryRunStatus.Completed,
      capabilityPath,
      artifact,
      outputs: loopResult.outputs,
    };
  } catch (err) {
    session.fail();
    await logger.log("run.failed", {
      summary: err instanceof Error ? err.message : String(err),
    });
    await handle.terminate().catch(() => undefined);
    await createHostedSessionRegistry().delete(runId).catch(() => undefined);
    return {
      runId,
      status: DiscoveryRunStatus.Failed,
      outputs: {},
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
