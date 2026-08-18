import { Controller, ReplayExecutionContext, SessionExecutionState } from "@cu/contracts";
import { HttpError } from "../../core/errors.js";
import { createHostedSessionRegistry } from "../../infrastructure/persistence/hosted-session-registry.js";
import { discoverCapabilityApp } from "../discover-capability.js";
import { replayCapabilityApp } from "../replay-capability.js";

export async function getHostedIntervention(id: string) {
  const record = await createHostedSessionRegistry().getByInterventionId(id);
  if (!record) {
    throw new HttpError(404, "NOT_FOUND", "Live intervention not found");
  }
  let liveViewUrl: string | undefined;
  try {
    const { getBrowserbaseLiveViewUrl } = await import(
      "../../infrastructure/browser/browserbase/browserbase-live-view.js"
    );
    liveViewUrl = await getBrowserbaseLiveViewUrl(record.externalSessionId);
  } catch {
    liveViewUrl = undefined;
  }
  return {
    id,
    runId: record.runId,
    live: true as const,
    state: record.executionState,
    controller: record.controller,
    intervention: {
      id,
      runId: record.runId,
      reason: "Human control of the remote browser session",
      currentStepId: record.currentStepId,
    },
    humanActions: [],
    liveViewUrl,
  };
}

export async function resumeHostedIntervention(id: string) {
  const registry = createHostedSessionRegistry();
  const record = await registry.getByInterventionId(id);
  if (!record) {
    throw new HttpError(404, "NOT_FOUND", "Live intervention not found");
  }
  await registry.put({
    ...record,
    controller: Controller.Automation,
    executionState: SessionExecutionState.Resuming,
  });

  if (record.mode === "discovery" && record.discovery) {
    const result = await discoverCapabilityApp({
      goal: record.discovery.goal,
      target: record.discovery.target,
      runId: record.runId,
      resume: record.discovery,
      reconnectSessionId: record.externalSessionId,
      enableOperator: false,
    });
    return {
      ok: true as const,
      state: SessionExecutionState.Running,
      controller: Controller.Automation,
      result,
    };
  }

  if (!record.capabilityId || !record.capabilityVersion) {
    throw new HttpError(
      409,
      "SESSION_EXPIRED",
      "Hosted session cannot resume without capability identity",
    );
  }

  const result = await replayCapabilityApp({
    capabilityId: record.capabilityId,
    version: record.capabilityVersion,
    inputs: record.inputs ?? {},
    executionContext:
      record.executionContext ?? ReplayExecutionContext.Development,
    allowDraft: record.allowDraft,
    options: {
      runId: record.runId,
      reconnectSessionId: record.externalSessionId,
      startFromStepId: record.currentStepId,
      enableOperator: false,
    },
  });

  return {
    ok: true as const,
    state: SessionExecutionState.Running,
    controller: Controller.Automation,
    result,
  };
}

export async function abortHostedIntervention(id: string) {
  const registry = createHostedSessionRegistry();
  const record = await registry.getByInterventionId(id);
  if (!record) {
    throw new HttpError(404, "NOT_FOUND", "Live intervention not found");
  }
  await registry.put({
    ...record,
    controller: Controller.None,
    executionState: "aborted",
  });
  try {
    const factory = await (
      await import("../../infrastructure/runtime.js")
    ).createRuntimeSessionFactory();
    const handle = await factory.reconnect?.(record.externalSessionId);
    await handle?.terminate();
  } catch {
    // Session may already be gone.
  }
  await registry.delete(record.runId);
  return { ok: true as const, state: SessionExecutionState.Failed };
}
