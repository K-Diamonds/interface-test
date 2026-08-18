/**
 * Deterministic capability replay. Never imports or invokes a DiscoveryModel.
 */
import type { CapabilityArtifact } from "@cu/contracts";
import {
  Controller,
  ExecutionResultStatus,
  ReplayExecutionContext,
  SessionExecutionState,
  createRunId,
} from "@cu/contracts";
import {
  replayCapability,
  type CapabilityExecutionResult,
  type ReplayOptions,
} from "../core/execution/replay-engine.js";
import { CapabilityStore } from "../core/capability/capability-store.js";
import { loadConfig } from "../infrastructure/config.js";
import { assertInvocable } from "../core/capability/execution-gate.js";
import { ValidationError } from "../core/errors.js";
import { resolveRepoRoot } from "../infrastructure/paths.js";
import { registerLiveIntervention } from "../interfaces/http/live-intervention.js";
import { createRuntimeSessionFactory } from "../infrastructure/runtime.js";
import type { BrowserSessionHandle } from "../infrastructure/browser/session-factory.js";
import { createHostedSessionRegistry } from "../infrastructure/persistence/hosted-session-registry.js";

export interface ReplayCapabilityCommand {
  capabilityPath?: string;
  capabilityId?: string;
  version?: number;
  inputs: Record<string, unknown>;
  options?: ReplayOptions;
  executionContext?: ReplayExecutionContext;
  /** Explicit opt-in for draft replay in development/review. */
  allowDraft?: boolean;
}

export async function replayCapabilityApp(
  command: ReplayCapabilityCommand,
): Promise<CapabilityExecutionResult> {
  const config = loadConfig();
  const rootDir = command.options?.rootDir ?? resolveRepoRoot();
  const store = new CapabilityStore(rootDir);

  let artifact: CapabilityArtifact;
  if (command.capabilityPath) {
    artifact = await store.load(command.capabilityPath);
  } else if (command.capabilityId && command.version) {
    artifact = await store.get(command.capabilityId, command.version);
  } else {
    throw new ValidationError(
      "Provide --capability path or --capability-id with --version",
    );
  }

  const context =
    command.executionContext ?? ReplayExecutionContext.Development;
  const allowDraft =
    command.allowDraft ??
    (context !== ReplayExecutionContext.Unattended &&
      config.automation.allowDraftReplay);

  assertInvocable({
    status: artifact.capability.status,
    capabilityId: artifact.capability.id,
    version: artifact.capability.version,
    executionContext: context,
    allowDraft,
  });

  const headless = command.options?.headless ?? config.automation.headless;
  const factory = await createRuntimeSessionFactory();
  let handle: BrowserSessionHandle | undefined;
  const reconnectId = command.options?.reconnectSessionId;
  const runId = command.options?.runId ?? createRunId();

  const result = await replayCapability(artifact, command.inputs, {
    ...command.options,
    runId,
    headless,
    openOperator: command.options?.openOperator ?? registerLiveIntervention,
    createSurface:
      command.options?.createSurface ??
      (async ({ tracesDir }) => {
        handle =
          reconnectId && factory.reconnect
            ? await factory.reconnect(reconnectId)
            : await factory.create({
                tracesDir,
                headless,
                runId,
              });
        if (handle.externalSessionId) {
          await createHostedSessionRegistry()
            .put({
              runId,
              externalSessionId: handle.externalSessionId,
              controller: Controller.Automation,
              executionState: SessionExecutionState.Running,
              capabilityId: artifact.capability.id,
              capabilityVersion: artifact.capability.version,
              currentStepId: command.options?.startFromStepId,
              mode: "replay",
              inputs: command.inputs,
              executionContext: context,
              allowDraft,
              updatedAt: new Date().toISOString(),
            })
            .catch(() => undefined);
        }
        return handle.surface;
      }),
  });

  if (handle?.externalSessionId) {
    const registry = createHostedSessionRegistry();
    if (result.status === ExecutionResultStatus.InterventionRequired) {
      await registry
        .put({
          runId: result.runId,
          externalSessionId: handle.externalSessionId,
          controller: Controller.Human,
          executionState: SessionExecutionState.HumanControl,
          capabilityId: artifact.capability.id,
          capabilityVersion: artifact.capability.version,
          currentStepId: result.stepId,
          interventionId: result.interventionId,
          mode: "replay",
          inputs: command.inputs,
          executionContext: context,
          allowDraft,
          updatedAt: new Date().toISOString(),
        })
        .catch(() => undefined);
      await handle.disconnect().catch(() => undefined);
      let liveViewUrl: string | undefined;
      try {
        const { getBrowserbaseLiveViewUrl } = await import(
          "../infrastructure/browser/browserbase/browserbase-live-view.js"
        );
        liveViewUrl = await getBrowserbaseLiveViewUrl(handle.externalSessionId);
      } catch {
        liveViewUrl = undefined;
      }
      return { ...result, liveViewUrl };
    }
    await handle.terminate().catch(() => undefined);
    await registry.delete(result.runId).catch(() => undefined);
  }

  return result;
}

/** Explicit marker for architectural tests: replay module graph must not load LLM. */
export const REPLAY_REQUIRES_DISCOVERY_MODEL = false as const;
