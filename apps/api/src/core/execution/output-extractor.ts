import type { ComputerSurface } from "../surface.js";
import type {
  CapabilityArtifact,
  CapabilityOutputDefinition,
  CapabilityStep,
} from "@cu/contracts";
import { bindTarget, bindTemplate } from "../domain/parameter-binding.js";
import { z } from "zod";
import { ValidationError } from "../errors.js";

/**
 * Artifact-driven output extraction — no application-specific fallback keys.
 */
export async function extractOutputs(
  surface: ComputerSurface,
  artifact: CapabilityArtifact,
  collected: Record<string, unknown>,
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const outputs: Record<string, unknown> = { ...collected };

  for (const step of artifact.steps) {
    if (step.type !== "extract") continue;
    await runExtractStep(surface, step, inputs, outputs);
  }

  return outputs;
}

export function createOutputSchema(
  defs: readonly CapabilityOutputDefinition[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of defs) {
    if (def.type === "string") shape[def.name] = z.string();
    else if (def.type === "number") shape[def.name] = z.number().finite();
    else if (def.type === "boolean") shape[def.name] = z.boolean();
    else shape[def.name] = z.unknown();
  }
  return z.object(shape);
}

/**
 * Strict contract validation — no Boolean("false")===true coercion.
 */
export function validateOutputContract(
  artifact: CapabilityArtifact,
  outputs: Record<string, unknown>,
): { ok: true; outputs: Record<string, unknown> } | { ok: false; message: string } {
  const schema = createOutputSchema(artifact.contract.outputs);
  const parsed = schema.safeParse(outputs);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, outputs: parsed.data };
}

export async function runExtractStep(
  surface: ComputerSurface,
  step: ExtractCapabilityStep,
  inputs: Record<string, unknown>,
  bucket: Record<string, unknown>,
): Promise<void> {
  const observation = await surface.observe();
  for (const out of step.outputs) {
    if (bucket[out.name] !== undefined && bucket[out.name] !== null) {
      // already collected
    } else {
      switch (out.from) {
        case "url":
          bucket[out.name] = await surface.getCurrentLocation();
          break;
        case "stateHint": {
          if (!out.stateHintKey) {
            throw new ValidationError(
              `Output ${out.name} requires stateHintKey when from=stateHint`,
            );
          }
          bucket[out.name] = observation.stateHints[out.stateHintKey];
          break;
        }
        case "text": {
          if (!out.target) {
            throw new ValidationError(
              `Output ${out.name} requires target when from=text`,
            );
          }
          const target = bindTarget(out.target, inputs);
          bucket[out.name] = await surface.read(target);
          break;
        }
        case "count": {
          if (!out.target) {
            throw new ValidationError(
              `Output ${out.name} requires target when from=count`,
            );
          }
          const target = bindTarget(out.target, inputs);
          bucket[out.name] = await surface.count(target);
          break;
        }
        case "input": {
          const key = out.inputKey ?? out.name;
          bucket[out.name] = inputs[key];
          break;
        }
        case "visible-text-includes": {
          const key = out.inputKey ?? out.name;
          const needle = String(inputs[key] ?? "");
          bucket[out.name] =
            needle.length > 0 &&
            observation.visibleText.some((t) => t.includes(needle));
          break;
        }
        case "element-exists": {
          if (!out.target) {
            bucket[out.name] = false;
            break;
          }
          try {
            const target = bindTarget(out.target, inputs);
            await surface.waitFor({ type: "element", target });
            bucket[out.name] = true;
          } catch {
            bucket[out.name] = false;
          }
          break;
        }
        default: {
          const _exhaustive: never = out.from;
          throw new ValidationError(
            `Unsupported extract from=${String(_exhaustive)}`,
          );
        }
      }
    }

    if (bucket[out.name] === undefined || bucket[out.name] === null) continue;
    if (out.transform === "number") {
      const n = Number(bucket[out.name]);
      if (!Number.isFinite(n)) {
        throw new ValidationError(
          `Extract ${out.name}: expected finite number, got ${String(bucket[out.name])}`,
        );
      }
      bucket[out.name] = n;
    } else if (out.transform === "boolean") {
      if (typeof bucket[out.name] !== "boolean") {
        throw new ValidationError(
          `Extract ${out.name}: expected boolean, got ${typeof bucket[out.name]}`,
        );
      }
    } else if (out.transform === "string") {
      bucket[out.name] = String(bucket[out.name]);
    }
  }
}

type ExtractCapabilityStep = Extract<CapabilityStep, { type: "extract" }>;

export function resolveStepValue(
  value:
    | string
    | { source: "input"; name: string }
    | { source: "env"; name: string },
  inputs: Record<string, unknown>,
): string {
  if (typeof value === "string") {
    return bindTemplate(value, inputs);
  }
  if (value.source === "input") {
    const v = inputs[value.name];
    if (v === undefined || v === null) {
      throw new Error(`Missing input value for ${value.name}`);
    }
    return String(v);
  }
  const envVal = process.env[value.name];
  if (!envVal) {
    throw new Error(`Missing environment variable ${value.name}`);
  }
  return envVal;
}
