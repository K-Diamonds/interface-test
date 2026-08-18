import type {
  ApplicationProfile,
  DiscoveryContract,
} from "../../domain/application-profile.js";
import type { CapabilityArtifact, CapabilityStep } from "@cu/contracts";
import {
  ActionType,
  CapabilityArtifactSchema,
  CapabilityStatus,
  CheckpointType,
  SchemaVersion,
  createStepId,
} from "@cu/contracts";
import { validateCapabilityArtifact } from "../validator.js";
import { GENERATOR_VERSION } from "../versioning.js";
import type { DiscoveryTraceStep } from "../discovery-trace.js";
import type { AutomationPolicy } from "../../policy/policy.js";
import { ValidationError } from "../../errors.js";
import {
  attachTransitionCheckpoints,
  filterActionableSteps,
} from "./trace-normalizer.js";
import { compileTraceStep } from "./target-compiler.js";
import { applyTypedParameterBindings } from "./binding-compiler.js";
import { ensureExtractStep, remapKnownOutcomes } from "./output-compiler.js";
import { escapeRegex, inferAppId, originPattern } from "./url-helpers.js";

export interface BuildCapabilityInput {
  goal: string;
  runId: string;
  steps: DiscoveryTraceStep[];
  outputs: Record<string, unknown>;
  policy: AutomationPolicy;
  startUrl: string;
  contract: DiscoveryContract;
  applicationProfile?: ApplicationProfile;
  parameters?: Record<string, unknown>;
  capabilityId?: string;
  capabilityName?: string;
}

/**
 * Generic trace compiler orchestration.
 * Stages: normalize → compile targets → bind parameters → outputs/outcomes → validate.
 */
export function buildCapabilityFromDiscovery(
  input: BuildCapabilityInput,
): CapabilityArtifact {
  const contract = input.contract;
  const parameters = input.parameters ?? {};
  const profile = input.applicationProfile;

  const noiseFiltered = filterActionableSteps(input.steps);

  if (noiseFiltered.length < 2) {
    throw new ValidationError(
      `Discovery trace too short to compile (${noiseFiltered.length} actionable steps). Refusing to synthesize a prewritten workflow.`,
    );
  }

  const compiledSteps: CapabilityStep[] = [];
  let stepIndex = 0;
  const symbolicStepIds = new Map<string, string>();

  compiledSteps.push({
    id: createStepId(stepIndex++),
    type: ActionType.Navigate,
    description: "Open application entry URL observed during discovery",
    url: input.startUrl,
    effect: "navigation",
    risk: "low",
    idempotency: "idempotent",
    checkpoint: {
      type: CheckpointType.Url,
      pattern: escapeRegex(new URL(input.startUrl).hostname),
    },
  });

  for (const trace of noiseFiltered) {
    const compiled = compileTraceStep({
      trace,
      index: stepIndex,
      parameters,
      profile,
      contract,
    });
    if (compiled.step) {
      if (compiled.symbolicId) {
        symbolicStepIds.set(compiled.symbolicId, compiled.step.id);
      }
      compiledSteps.push(compiled.step);
      stepIndex += 1;
    }
  }

  if (compiledSteps.length < 3) {
    throw new ValidationError(
      `Compiled only ${compiledSteps.length} steps from discovery — refusing to fall back to a hardcoded workflow.`,
    );
  }

  const parameterized = applyTypedParameterBindings(
    compiledSteps,
    noiseFiltered,
    contract,
    parameters,
    profile,
  );

  attachTransitionCheckpoints(parameterized, noiseFiltered);
  stepIndex = ensureExtractStep(parameterized, contract, stepIndex);

  const knownOutcomes = remapKnownOutcomes(contract, symbolicStepIds);

  const artifact: CapabilityArtifact = {
    schemaVersion: SchemaVersion.V1,
    capability: {
      id:
        input.capabilityId ??
        contract.capability.id ??
        "discovered.capability",
      name:
        input.capabilityName ??
        contract.capability.name ??
        "Discovered capability",
      description: contract.capability.description ?? input.goal,
      version: 1,
      // Governance default. Discovery never auto-approves. Steps for a given
      // id+version stay immutable; later approval only changes this status.
      status: CapabilityStatus.Draft,
    },
    compatibility: {
      appId: inferAppId(input.startUrl),
      appFamily: inferAppId(input.startUrl),
      targetPatterns: [`${originPattern(input.startUrl)}/**`],
    },
    contract: {
      inputs: contract.inputs,
      outputs: contract.outputs,
    },
    policy: {
      allowedDomains: input.policy.allowedDomains,
      allowedRoutes: input.policy.allowedRoutes?.map((r) => r.source),
      allowedActions: input.policy.allowedActions,
      riskyActionPolicy: input.policy.riskyActionBehavior,
    },
    steps: parameterized,
    successCondition: contract.success,
    knownOutcomes,
    metadata: {
      createdAt: new Date().toISOString(),
      discoveredFromRunId: input.runId,
      generatorVersion: GENERATOR_VERSION,
    },
  };

  validateCapabilityArtifact(artifact);
  return CapabilityArtifactSchema.parse(artifact);
}
