import type {
  ApplicationProfile,
  DiscoveryContract,
} from "../../domain/application-profile.js";
import type {
  CapabilityStep,
  LocatorStrategy,
  TargetDescriptor,
} from "@cu/contracts";
import { ActionType, ValueSource, createStepId } from "@cu/contracts";
import type { ObservableControl } from "@cu/contracts";
import type { DiscoveryTraceStep } from "../discovery-trace.js";
import { resolveTypeInputBinding } from "./binding-compiler.js";

export function compileTraceStep(input: {
  trace: DiscoveryTraceStep;
  index: number;
  parameters: Record<string, unknown>;
  profile?: ApplicationProfile;
  contract: DiscoveryContract;
}): { step: CapabilityStep | null; symbolicId?: string } {
  const id = createStepId(input.index);
  const action = input.trace.action;

  switch (action.actionType) {
    case "navigate":
      return {
        step: {
          id,
          type: ActionType.Navigate,
          description: action.reasoning,
          url: action.url,
          effect: "navigation",
          risk: "low",
          idempotency: "idempotent",
        },
      };
    case "click": {
      const control = input.trace.resolvedControl;
      if (!control) return { step: null };
      const defaultTarget = targetFromControl(control);
      let target = defaultTarget;
      let symbolicId: string | undefined;

      if (input.profile?.normalizeClickTarget) {
        const normalized = input.profile.normalizeClickTarget({
          control,
          reasoning: action.reasoning,
          parameters: input.parameters,
          defaultTarget,
        });
        if (normalized) {
          target = normalized;
          // Bind known-outcome symbolic ids declared by the contract to this step.
          for (const outcome of input.contract.knownOutcomes ?? []) {
            if (outcome.detection.kind === "missing-target") {
              symbolicId = outcome.detection.stepId;
              break;
            }
          }
          if (!symbolicId) symbolicId = id;
        }
      }

      const step: CapabilityStep = {
        id,
        type: ActionType.Click,
        description: action.reasoning,
        target,
        effect: "unknown",
        risk: "medium",
        idempotency: "idempotent",
      };

      if (input.profile?.checkpointAfterClick) {
        const checkpoint = input.profile.checkpointAfterClick({
          control,
          reasoning: action.reasoning,
          parameters: input.parameters,
        });
        if (checkpoint) {
          step.checkpoint = checkpoint;
          step.effect = "reversible-mutation";
          step.risk = "low";
          if (symbolicId) {
            step.onError = "fail";
          }
        }
      }

      return { step, symbolicId };
    }
    case "type": {
      const control = input.trace.resolvedControl;
      if (!control) return { step: null };
      const typedValue = action.value;
      const boundName = resolveTypeInputBinding({
        typedValue,
        sensitive: action.sensitive,
        control,
        reasoning: action.reasoning,
        parameters: input.parameters,
        contract: input.contract,
        profile: input.profile,
      });
      return {
        step: {
          id,
          type: ActionType.Type,
          description: action.reasoning,
          target: targetFromControl(control),
          value: boundName
            ? { source: ValueSource.Input, name: boundName }
            : typedValue,
          effect: "data-entry",
          risk: "low",
          idempotency: "idempotent",
        },
      };
    }
    default:
      return { step: null };
  }
}

export function targetFromControl(control: ObservableControl): TargetDescriptor {
  const strategies = control.candidateLocators.map((c) => c.strategy);
  const primary: LocatorStrategy =
    strategies[0] ??
    ({
      kind: "text",
      text: control.accessibleName ?? control.text ?? control.ref,
    } as const);

  const preferred =
    strategies.find((s) => s.kind === "role" && "name" in s && s.name) ??
    strategies.find((s) => s.kind === "testId") ??
    strategies.find((s) => s.kind === "placeholder") ??
    primary;

  const fallbacks = strategies.filter((s) => s !== preferred).slice(0, 4);

  return {
    description: control.accessibleName ?? control.text ?? control.ref,
    primary: preferred,
    fallbacks,
    expected: {
      role: control.role,
      text: control.text,
      tag: control.tag,
      inputType: control.inputType,
    },
  };
}
