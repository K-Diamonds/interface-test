/**
 * Unattended agent invocation. Thin adapter over replayCapabilityApp.
 * Always executionContext=unattended (approved only). Never duplicates replay.
 */
import {
  ReplayExecutionContext,
  type AgentInvokeResponse,
} from "@cu/contracts";
import { CapabilityStore } from "../core/capability/capability-store.js";
import { assertInvocable } from "../core/capability/execution-gate.js";
import {
  createInputSchema,
  validateInputs,
} from "../core/capability/validator.js";
import { HttpError } from "../core/errors.js";
import { replayCapabilityApp } from "./replay-capability.js";
import { resolveRepoRoot } from "../infrastructure/paths.js";
import { resolveApplicationProfile } from "../profiles/registry.js";
import type { ReplayOptions } from "../core/execution/types.js";

export async function invokeAgentCapability(input: {
  capabilityId: string;
  version: number;
  arguments: Record<string, unknown>;
  rootDir?: string;
  replayOptions?: ReplayOptions;
}): Promise<AgentInvokeResponse> {
  const rootDir = input.rootDir ?? resolveRepoRoot();
  const store = new CapabilityStore(rootDir);
  let artifact;
  try {
    artifact = await store.get(input.capabilityId, input.version);
  } catch {
    throw new HttpError(404, "NOT_FOUND", "Capability version not found");
  }

  assertInvocable({
    status: artifact.capability.status,
    capabilityId: artifact.capability.id,
    version: artifact.capability.version,
    executionContext: ReplayExecutionContext.Unattended,
    allowDraft: false,
  });

  const unknown = validateInputs(artifact, input.arguments, {
    rejectUnknown: true,
  });
  if (!unknown.ok) {
    const unknownOnly = unknown.errors.filter((e) => e.startsWith("Unknown"));
    if (unknownOnly.length > 0) {
      throw new HttpError(400, "VALIDATION_ERROR", unknownOnly.join("; "), {
        issues: unknownOnly,
      });
    }
  }

  const startUrl = artifact.compatibility.targetPatterns[0]?.replace(
    /\/\*\*$/,
    "",
  );
  const profile = startUrl
    ? resolveApplicationProfile(startUrl.replace("http://", "https://"))
    : undefined;
  const filled = profile?.resolveInvocationParameters
    ? profile.resolveInvocationParameters({
        parameters: { ...input.arguments },
        getenv: (key) => process.env[key],
      })
    : { ...input.arguments };

  const selected: Record<string, unknown> = {};
  for (const def of artifact.contract.inputs) {
    if (filled[def.name] !== undefined) selected[def.name] = filled[def.name];
  }

  const parsed = createInputSchema(artifact.contract.inputs).safeParse(selected);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`)
        .join("; "),
      { issues: parsed.error.issues },
    );
  }

  const result = await replayCapabilityApp({
    capabilityId: input.capabilityId,
    version: input.version,
    inputs: parsed.data,
    executionContext: ReplayExecutionContext.Unattended,
    allowDraft: false,
    options: {
      ...input.replayOptions,
      rootDir,
      enableOperator: false,
    },
  });

  const capability = {
    id: artifact.capability.id,
    version: artifact.capability.version,
  };
  if (result.status === "success") {
    return {
      status: "success",
      capability,
      outputs: result.outputs,
      runId: result.runId,
    };
  }
  if (result.status === "business_outcome") {
    return {
      status: "business_outcome",
      capability,
      outcome: {
        code: result.outcome.code,
        message: result.outcome.message,
      },
      runId: result.runId,
    };
  }
  if (result.status === "intervention_required") {
    return {
      status: "intervention_required",
      capability,
      reason: result.reason,
      runId: result.runId,
      interventionId: result.interventionId,
      liveViewUrl: result.liveViewUrl,
    };
  }
  return {
    status: "failure",
    capability,
    failure: {
      code: result.failure.code,
      message: result.failure.message,
    },
    runId: result.runId,
  };
}
