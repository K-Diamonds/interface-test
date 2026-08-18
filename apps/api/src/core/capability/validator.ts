import {
  ActionType,
  CapabilityArtifactSchema,
  PrimitiveType,
  type CapabilityArtifact,
  type CapabilityInputDefinition,
} from "@cu/contracts";
import { z } from "zod";
import { ValidationError } from "../errors.js";
import { containsSecrets } from "../policy/redaction.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateCapabilityArtifact(
  value: unknown,
): asserts value is CapabilityArtifact {
  const result = validateCapability(value);
  if (!result.ok) {
    throw new ValidationError(result.errors.join("; "));
  }
}

export function validateCapability(value: unknown): ValidationResult {
  const errors: string[] = [];
  const parsed = CapabilityArtifactSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { ok: false, errors };
  }

  const artifact = parsed.data;
  const inputNames = new Set(artifact.contract.inputs.map((i) => i.name));
  const outputNames = new Set(artifact.contract.outputs.map((o) => o.name));

  const serialized = JSON.stringify(artifact);
  if (containsSecrets(serialized)) {
    errors.push("Artifact appears to contain secrets or sensitive credentials");
  }

  for (const step of artifact.steps) {
    if (
      (step.type === ActionType.Click ||
        step.type === ActionType.Type ||
        step.type === ActionType.Select ||
        step.type === ActionType.Read) &&
      !step.target
    ) {
      errors.push(`Step ${step.id} requires a target`);
    }

    if (step.type === ActionType.Type || step.type === ActionType.Select) {
      if (typeof step.value === "object" && step.value.source === "input") {
        if (!inputNames.has(step.value.name)) {
          errors.push(
            `Step ${step.id} references unknown input parameter "${step.value.name}"`,
          );
        }
      }
    }

    if (step.type === "extract") {
      for (const out of step.outputs) {
        if (!outputNames.has(out.name)) {
          errors.push(
            `Extract step ${step.id} references undeclared output "${out.name}"`,
          );
        }
      }
    }

    if (step.type === ActionType.Read && step.outputName && !outputNames.has(step.outputName)) {
      errors.push(
        `Read step ${step.id} references undeclared output "${step.outputName}"`,
      );
    }
  }

  for (const domain of artifact.policy.allowedDomains) {
    if (domain.includes(" ") || domain.includes("://")) {
      errors.push(`Invalid allowed domain: ${domain}`);
    }
  }

  if (!artifact.successCondition) {
    errors.push("successCondition is required");
  }

  if (!artifact.capability.version || artifact.capability.version < 1) {
    errors.push("capability.version must be a positive integer");
  }

  return { ok: errors.length === 0, errors };
}

export function validateInputs(
  artifact: CapabilityArtifact,
  inputs: Record<string, unknown>,
  options: { rejectUnknown?: boolean } = {},
): ValidationResult {
  const errors: string[] = [];
  const allowed = new Set(artifact.contract.inputs.map((i) => i.name));
  if (options.rejectUnknown) {
    for (const key of Object.keys(inputs)) {
      if (!allowed.has(key)) {
        errors.push(`Unknown input: ${key}`);
      }
    }
  }
  for (const def of artifact.contract.inputs) {
    const value = inputs[def.name];
    if (def.required && (value === undefined || value === null || value === "")) {
      errors.push(`Missing required input: ${def.name}`);
      continue;
    }
    if (value === undefined || value === null) continue;
    const actual =
      typeof value === "number"
        ? "number"
        : typeof value === "boolean"
          ? "boolean"
          : typeof value === "string"
            ? "string"
            : "unknown";
    if (actual !== def.type) {
      errors.push(
        `Input ${def.name} expected ${def.type} but received ${actual}`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Zod object derived from the capability input contract. */
export function createInputSchema(defs: readonly CapabilityInputDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of defs) {
    let field: z.ZodTypeAny =
      def.type === PrimitiveType.Number
        ? z.number()
        : def.type === PrimitiveType.Boolean
          ? z.boolean()
          : z.string().min(1);
    if (!def.required) field = field.optional();
    shape[def.name] = field;
  }
  return z.object(shape).strict();
}
