/**
 * Application profile seam — demo/vendor-specific semantics live here,
 * not inside the generic compiler or replay engine.
 */
import type {
  Checkpoint,
  KnownBusinessOutcome,
  SurfaceObservation,
  TargetDescriptor,
  CapabilityInputDefinition,
  CapabilityOutputDefinition,
} from "@cu/contracts";
import {
  ExtractFrom,
  PrimitiveType,
  RiskyActionBehavior,
} from "@cu/contracts";
import type { ComputerSurface } from "../surface.js";

export interface DiscoveryContract {
  capability: {
    id?: string;
    name?: string;
    description?: string;
  };
  /** Business + session inputs declared for this discovery goal. */
  inputs: CapabilityInputDefinition[];
  outputs: CapabilityOutputDefinition[];
  /** Declarative extract step outputs (artifact-driven). */
  extractOutputs: Array<{
    name: string;
    from: ExtractFrom;
    stateHintKey?: string;
    inputKey?: string;
    target?: TargetDescriptor;
    transform?: PrimitiveType;
  }>;
  success: Checkpoint;
  knownOutcomes?: KnownBusinessOutcome[];
}

export interface GoalVerifier {
  verify(input: {
    goal: string;
    observation: SurfaceObservation;
    proposedOutputs?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  }): { ok: boolean; reason: string; expected?: unknown; observed?: unknown };
}

export interface TargetNormalizationInput {
  control: {
    ref: string;
    role?: string;
    accessibleName?: string;
    text?: string;
    tag?: string;
    inputType?: string;
    candidateLocators: Array<{ strategy: TargetDescriptor["primary"]; confidence: number }>;
  };
  reasoning: string;
  parameters: Record<string, unknown>;
  defaultTarget: TargetDescriptor;
}

/** Serializable policy descriptor — mapped to runtime AutomationPolicy by the API. */
export interface ApplicationPolicyDescriptor {
  allowedDomains: string[];
  allowedRoutePatterns?: string[];
  riskyActionBehavior?: RiskyActionBehavior;
}

export interface TypeValueBindingContext {
  typedValue: string;
  sensitive?: boolean;
  control: TargetNormalizationInput["control"];
  reasoning: string;
  parameters: Record<string, unknown>;
  declaredInputs: CapabilityInputDefinition[];
}

export interface ApplicationProfile {
  id: string;
  matches(targetUrl: string): boolean;
  discoveryContract(input: {
    goal: string;
    parameters: Record<string, unknown>;
    startUrl: string;
  }): DiscoveryContract;
  /** Demo/app allowlist — generic orchestration must not hardcode SauceDemo domains. */
  policyDescriptor?(): ApplicationPolicyDescriptor;
  /**
   * Fill missing session/demo parameters from environment.
   * Generic discovery must not know demo credential env keys.
   */
  resolveInvocationParameters?(input: {
    parameters: Record<string, unknown>;
    getenv: (key: string) => string | undefined;
  }): Record<string, unknown>;
  /**
   * Optional explicit binding of a typed discovery value → declared input name.
   * Prefer exact value match against parameters; profile may add metadata.
   */
  bindTypeValue?(input: TypeValueBindingContext): string | undefined;
  normalizeClickTarget?(input: TargetNormalizationInput): TargetDescriptor | undefined;
  checkpointAfterClick?(input: {
    control: TargetNormalizationInput["control"];
    reasoning: string;
    parameters: Record<string, unknown>;
  }): Checkpoint | undefined;
  createGoalVerifier?(contract: DiscoveryContract): GoalVerifier;
  enrichObservation?(observation: SurfaceObservation): SurfaceObservation;
  bootstrapSession?(input: {
    surface: ComputerSurface;
    parameters: Record<string, unknown>;
  }): Promise<void>;
}

/** Conservative verifier — never claims success without profile support. */
export const UnverifiedGoalVerifier: GoalVerifier = {
  verify() {
    return {
      ok: false,
      reason: "unverified",
      expected: "application-specific goal verifier",
      observed: "generic fallback",
    };
  },
};
