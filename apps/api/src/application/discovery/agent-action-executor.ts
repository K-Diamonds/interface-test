import type { ObservableControl, SurfaceObservation, TargetDescriptor } from "@cu/contracts";
import {
  ActionType,
  ExtractFrom,
  LocatorKind,
  WaitConditionType,
  type AgentAction,
} from "@cu/contracts";
import type { ComputerSurface } from "../../core/surface.js";
import type { DiscoveryTraceStep } from "../../core/capability/discovery-trace.js";

const DEFAULT_WAIT_MS = 500;

export interface AgentActionExecution {
  surface: ComputerSurface;
  parameters: Record<string, unknown>;
}

export function controlToTarget(control: ObservableControl): TargetDescriptor {
  const strategies = control.candidateLocators.map((c) => c.strategy);
  const preferred =
    strategies.find((s) => s.kind === LocatorKind.TestId) ??
    strategies.find((s) => s.kind === LocatorKind.Placeholder) ??
    strategies.find(
      (s) => s.kind === LocatorKind.Role && "name" in s && Boolean(s.name),
    ) ??
    strategies[0];
  if (!preferred) {
    throw new Error(`Control ${control.ref} has no locator candidates`);
  }
  return {
    description: control.accessibleName ?? control.text ?? control.ref,
    primary: preferred,
    fallbacks: strategies.filter((s) => s !== preferred).slice(0, 4),
    expected: {
      role: control.role,
      text: control.text,
      tag: control.tag,
      inputType: control.inputType,
    },
    ref: control.ref,
  };
}

export function resolveObservedControl(
  observation: SurfaceObservation,
  ref: string,
): ObservableControl {
  const control = observation.controls.find((c) => c.ref === ref);
  if (!control) {
    throw new Error(`Unknown control ref: ${ref}`);
  }
  return control;
}

/**
 * Bind type-action values from invocation parameters.
 * Placeholders and password fields are resolved here so the model never needs
 * the secret in its proposal.
 */
export function resolveTypedValue(
  action: Extract<AgentAction, { actionType: typeof ActionType.Type }>,
  control: ObservableControl,
  parameters: Record<string, unknown>,
): string {
  const username =
    typeof parameters.username === "string" ? parameters.username : undefined;
  const password =
    typeof parameters.password === "string" ? parameters.password : undefined;
  const proposed = action.value;

  const passwordPlaceholder =
    proposed === "{{password}}" ||
    proposed === "$PASSWORD" ||
    proposed === "***" ||
    proposed === "password" ||
    control.inputType === "password";
  if (passwordPlaceholder && password) {
    return password;
  }

  const usernamePlaceholder =
    proposed === "{{username}}" ||
    proposed === "$USERNAME" ||
    (proposed === "" && /username/i.test(action.reasoning));
  if (usernamePlaceholder && username) {
    return username;
  }

  return proposed;
}

export async function executeAgentAction(
  action: AgentAction,
  ctx: AgentActionExecution,
  observation: SurfaceObservation,
  trace: DiscoveryTraceStep,
  outputs: Record<string, unknown>,
): Promise<void> {
  switch (action.actionType) {
    case ActionType.Navigate:
      await ctx.surface.navigate(action.url);
      return;
    case ActionType.Click: {
      const control = resolveObservedControl(observation, action.targetRef);
      trace.resolvedControl = control;
      await ctx.surface.click(controlToTarget(control));
      return;
    }
    case ActionType.Type: {
      const control = resolveObservedControl(observation, action.targetRef);
      trace.resolvedControl = control;
      const value = resolveTypedValue(action, control, ctx.parameters);
      await ctx.surface.type(controlToTarget(control), value);
      return;
    }
    case ActionType.Read: {
      const control = resolveObservedControl(observation, action.targetRef);
      trace.resolvedControl = control;
      await ctx.surface.read(controlToTarget(control));
      return;
    }
    case ActionType.Wait:
      if (action.urlPattern) {
        await ctx.surface.waitFor({
          type: WaitConditionType.Url,
          pattern: action.urlPattern,
        });
      } else if (action.text) {
        await ctx.surface.waitFor({
          type: WaitConditionType.Text,
          text: action.text,
        });
      } else {
        await ctx.surface.waitFor({
          type: WaitConditionType.Timeout,
          ms: action.waitMs ?? DEFAULT_WAIT_MS,
        });
      }
      return;
    case ActionType.Extract:
      for (const field of action.fields) {
        if (field.from === ExtractFrom.Url) {
          outputs[field.name] = await ctx.surface.getCurrentLocation();
        } else if (field.from === ExtractFrom.StateHint) {
          outputs[field.name] = observation.stateHints[field.name];
        } else if (field.targetRef) {
          const control = resolveObservedControl(observation, field.targetRef);
          outputs[field.name] = await ctx.surface.read(controlToTarget(control));
        }
      }
      return;
    default:
      return;
  }
}
