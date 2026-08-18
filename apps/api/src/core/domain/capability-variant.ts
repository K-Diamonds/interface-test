import type {
  CapabilityArtifact,
  CapabilityOverlay,
  CapabilityStep,
  LocatorStrategy,
  TargetDescriptor,
} from "@cu/contracts";
import { CapabilityArtifactSchema } from "@cu/contracts";
import { ValidationError } from "../errors.js";

export interface ResolveCapabilityVariantInput {
  capability: CapabilityArtifact;
  appVersion?: string;
  tenantId?: string;
}

/**
 * Deterministic overlay resolution:
 *   base capability < application-version override < tenant override
 *
 * Pure — no persistence, no network, no Playwright.
 */
export function resolveCapabilityVariant(
  input: ResolveCapabilityVariantInput,
): CapabilityArtifact {
  const versionOverlay =
    input.appVersion && input.capability.compatibility.versionOverrides
      ? input.capability.compatibility.versionOverrides[input.appVersion]
      : undefined;
  const tenantOverlay =
    input.tenantId && input.capability.compatibility.tenantOverrides
      ? input.capability.compatibility.tenantOverrides[input.tenantId]
      : undefined;

  let next = input.capability;
  if (versionOverlay) {
    next = applyOverlay(next, versionOverlay);
  }
  if (tenantOverlay) {
    next = applyOverlay(next, tenantOverlay);
  }
  if (!versionOverlay && !tenantOverlay) {
    return input.capability;
  }

  const parsed = CapabilityArtifactSchema.safeParse(next);
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid overlay result: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  return parsed.data;
}

function applyOverlay(
  artifact: CapabilityArtifact,
  overlay: CapabilityOverlay,
): CapabilityArtifact {
  const steps = artifact.steps.map((step) => applyStepOverlay(step, overlay));
  const allowedRoutes = overlay.routeOverrides ?? artifact.policy.allowedRoutes;
  return {
    ...artifact,
    steps,
    policy: {
      ...artifact.policy,
      allowedRoutes,
    },
  };
}

function applyStepOverlay(
  step: CapabilityStep,
  overlay: CapabilityOverlay,
): CapabilityStep {
  if (!("target" in step) || !step.target) return step;
  const aliases = overlay.targetAliases ?? {};
  const mappedId = aliases[step.id] ?? step.id;
  const loc = overlay.locatorOverrides?.[mappedId] ?? overlay.locatorOverrides?.[step.id];
  if (!loc) return step;
  const target: TargetDescriptor = {
    ...step.target,
    description: loc.description ?? step.target.description,
    primary: (loc.primary as LocatorStrategy | undefined) ?? step.target.primary,
    fallbacks: loc.fallbacks ?? step.target.fallbacks,
  };
  return { ...step, target } as CapabilityStep;
}
