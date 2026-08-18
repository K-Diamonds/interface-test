import type { Checkpoint } from "@cu/contracts";
import type { ComputerSurface } from "../surface.js";
import type { CheckpointEvaluationResult } from "./ports.js";
import { bindTarget, bindTemplate } from "./parameter-binding.js";

/**
 * Checkpoint evaluation returns a structured result.
 * Unsatisfied checkpoints are ordinary outcomes — not control-flow exceptions.
 */
export async function evaluateCheckpoint(
  surface: ComputerSurface,
  checkpoint: Checkpoint,
  inputs: Record<string, unknown> = {},
): Promise<CheckpointEvaluationResult> {
  switch (checkpoint.type) {
    case "url": {
      const location = await surface.getCurrentLocation();
      const pattern = bindTemplate(checkpoint.pattern, inputs);
      if (!new RegExp(pattern).test(location)) {
        return {
          satisfied: false,
          expected: pattern,
          observed: location,
          message: `URL checkpoint failed: expected pattern ${pattern}`,
        };
      }
      return { satisfied: true };
    }
    case "element-visible": {
      const target = bindTarget(checkpoint.target, inputs);
      try {
        await surface.waitFor({ type: "element", target });
        return { satisfied: true };
      } catch {
        return {
          satisfied: false,
          expected: target,
          observed: await surface.getCurrentLocation(),
          message: `Element not visible: ${target.description}`,
        };
      }
    }
    case "element-text": {
      const target = bindTarget(checkpoint.target, inputs);
      const expected = bindTemplate(checkpoint.expected, inputs);
      try {
        const actual = await surface.read(target);
        if (!actual.includes(expected) && actual !== expected) {
          return {
            satisfied: false,
            expected,
            observed: actual,
            message: `Element text checkpoint failed for ${target.description}`,
          };
        }
        return { satisfied: true };
      } catch (err) {
        return {
          satisfied: false,
          expected,
          observed: err instanceof Error ? err.message : String(err),
          message: `Could not read element for text checkpoint: ${target.description}`,
        };
      }
    }
    case "value": {
      const target = bindTarget(checkpoint.target, inputs);
      const expected = bindTemplate(checkpoint.expected, inputs);
      try {
        const actual = await surface.read(target);
        if (actual !== expected && !actual.includes(expected)) {
          return {
            satisfied: false,
            expected,
            observed: actual,
            message: "Value checkpoint failed",
          };
        }
        return { satisfied: true };
      } catch (err) {
        return {
          satisfied: false,
          expected,
          observed: err instanceof Error ? err.message : String(err),
          message: "Value checkpoint read failed",
        };
      }
    }
    case "count": {
      const observation = await surface.observe();
      const expected = checkpoint.expected;
      const numeric =
        typeof observation.stateHints.numericBadge === "number"
          ? observation.stateHints.numericBadge
          : typeof observation.stateHints.count === "number"
            ? observation.stateHints.count
            : undefined;
      if (typeof numeric === "number" && numeric === expected) {
        return { satisfied: true };
      }
      if (observation.visibleText.some((t) => t === String(expected))) {
        return { satisfied: true };
      }
      return {
        satisfied: false,
        expected,
        observed: numeric ?? observation.visibleText.slice(0, 5),
        message: "Count checkpoint failed",
      };
    }
    case "composite": {
      if (checkpoint.op === "and") {
        for (const check of checkpoint.checks) {
          const result = await evaluateCheckpoint(surface, check, inputs);
          if (!result.satisfied) return result;
        }
        return { satisfied: true };
      }
      const failures: CheckpointEvaluationResult[] = [];
      for (const check of checkpoint.checks) {
        const result = await evaluateCheckpoint(surface, check, inputs);
        if (result.satisfied) return { satisfied: true };
        failures.push(result);
      }
      const last = failures[failures.length - 1];
      return {
        satisfied: false,
        expected: checkpoint.checks,
        observed: failures.map((f) =>
          f.satisfied ? null : { expected: f.expected, observed: f.observed },
        ),
        message: last && !last.satisfied ? last.message : "Composite OR failed",
      };
    }
    default: {
      const _exhaustive: never = checkpoint;
      return {
        satisfied: false,
        expected: _exhaustive,
        observed: null,
        message: "Unknown checkpoint type",
      };
    }
  }
}
