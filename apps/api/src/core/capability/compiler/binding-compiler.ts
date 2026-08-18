import type {
  ApplicationProfile,
  DiscoveryContract,
} from "../../domain/application-profile.js";
import {
  ActionType,
  ValueSource,
  type CapabilityStep,
  type LocatorStrategy,
  type NestedLocatorRef,
  type ObservableControl,
  type TargetDescriptor,
} from "@cu/contracts";
import type { DiscoveryTraceStep } from "../discovery-trace.js";

export function resolveTypeInputBinding(input: {
  typedValue: string;
  sensitive?: boolean;
  control: ObservableControl;
  reasoning: string;
  parameters: Record<string, unknown>;
  contract: DiscoveryContract;
  profile?: ApplicationProfile;
}): string | undefined {
  // Primary: exact equality against declared invocation parameters.
  for (const def of input.contract.inputs) {
    const concrete = input.parameters[def.name];
    if (
      typeof concrete === "string" &&
      concrete.length > 0 &&
      concrete === input.typedValue
    ) {
      return def.name;
    }
  }
  // Placeholders used during discovery
  const placeholder = /^\{\{(\w+)\}\}$/.exec(input.typedValue);
  if (placeholder) {
    const name = placeholder[1]!;
    if (input.contract.inputs.some((i) => i.name === name)) return name;
  }
  // Secondary: application profile metadata (e.g. sensitive password field).
  return input.profile?.bindTypeValue?.({
    typedValue: input.typedValue,
    sensitive: input.sensitive,
    control: input.control,
    reasoning: input.reasoning,
    parameters: input.parameters,
    declaredInputs: input.contract.inputs,
  });
}

/**
 * Bind declared parameter values into capability steps using exact-field
 * replacements on known binding sites (locator text/name/selector, URLs,
 * checkpoint expected). Does not walk arbitrary prose strings.
 */
export function applyTypedParameterBindings(
  steps: CapabilityStep[],
  traces: DiscoveryTraceStep[],
  contract: DiscoveryContract,
  parameters: Record<string, unknown>,
  profile?: ApplicationProfile,
): CapabilityStep[] {
  void traces;
  void profile;
  const exact: Array<{ name: string; value: string }> = [];
  for (const def of contract.inputs) {
    const v = parameters[def.name];
    if (typeof v === "string" && v.length > 0) {
      exact.push({ name: def.name, value: v });
    }
  }

  return steps.map((step) => {
    const next = { ...step } as CapabilityStep;

    if (next.type === ActionType.Navigate) {
      next.url = templateExact(next.url, exact);
    }
    if (
      next.type === ActionType.Click ||
      next.type === ActionType.Type ||
      next.type === ActionType.Select ||
      next.type === ActionType.Read
    ) {
      next.target = bindTargetDescriptor(next.target, exact);
    }
    if (next.type === ActionType.Type && typeof next.value === "string") {
      const match = exact.find((e) => e.value === next.value);
      if (match) {
        next.value = { source: ValueSource.Input, name: match.name };
      }
    }
    if (next.checkpoint) {
      next.checkpoint = bindCheckpoint(next.checkpoint, exact);
    }
    return next;
  });
}

export function templateExact(
  value: string,
  exact: Array<{ name: string; value: string }>,
): string {
  for (const { name, value: concrete } of exact) {
    if (value === concrete) return `{{${name}}}`;
  }
  return value;
}

export function bindLocatorStrategy(
  strategy: LocatorStrategy,
  exact: Array<{ name: string; value: string }>,
): LocatorStrategy {
  switch (strategy.kind) {
    case "role":
      return {
        ...strategy,
        name: strategy.name ? templateExact(strategy.name, exact) : undefined,
      };
    case "label":
    case "text":
    case "placeholder":
      return { ...strategy, text: templateExact(strategy.text, exact) };
    case "testId":
      return { ...strategy, testId: templateExact(strategy.testId, exact) };
    case "css":
    case "xpath":
      return {
        ...strategy,
        selector: replaceExactInSelector(strategy.selector, exact),
      };
    case "accessibility":
      return {
        ...strategy,
        name: strategy.name ? templateExact(strategy.name, exact) : undefined,
      };
    case "relative":
      return {
        ...strategy,
        anchor: {
          primary: bindAtomicLocator(strategy.anchor.primary, exact),
          fallbacks: strategy.anchor.fallbacks.map((f) =>
            bindAtomicLocator(f, exact),
          ),
        },
        target: {
          primary: bindAtomicLocator(strategy.target.primary, exact),
          fallbacks: strategy.target.fallbacks.map((f) =>
            bindAtomicLocator(f, exact),
          ),
        },
      };
    case "vision":
      return {
        ...strategy,
        description: templateExact(strategy.description, exact),
      };
    default:
      return strategy;
  }
}

function bindAtomicLocator(
  strategy: NestedLocatorRef["primary"],
  exact: Array<{ name: string; value: string }>,
): NestedLocatorRef["primary"] {
  return bindLocatorStrategy(strategy, exact) as NestedLocatorRef["primary"];
}

/** Only replace when the concrete value is a full segment or quoted string — not substrings of unrelated text. */
export function replaceExactInSelector(
  selector: string,
  exact: Array<{ name: string; value: string }>,
): string {
  let out = selector;
  for (const { name, value } of exact) {
    if (!value) continue;
    // Exact equality
    if (out === value) return `{{${name}}}`;
    // Quoted occurrences in CSS/XPath
    const quoted = [
      `"${value}"`,
      `'${value}'`,
      `="${value}"`,
      `='${value}'`,
    ];
    for (const q of quoted) {
      if (out.includes(q)) {
        out = out.split(q).join(q.replace(value, `{{${name}}}`));
      }
    }
    // normalize-space()='value' style
    const nx = `normalize-space()='${value}'`;
    if (out.includes(nx)) {
      out = out.split(nx).join(`normalize-space()='{{${name}}}'`);
    }
  }
  return out;
}

export function bindTargetDescriptor(
  target: TargetDescriptor,
  exact: Array<{ name: string; value: string }>,
): TargetDescriptor {
  return {
    ...target,
    description: templateExact(target.description, exact),
    primary: bindLocatorStrategy(target.primary, exact),
    fallbacks: target.fallbacks.map((f) => bindLocatorStrategy(f, exact)),
    expected: target.expected
      ? {
          ...target.expected,
          text: target.expected.text
            ? templateExact(target.expected.text, exact)
            : undefined,
        }
      : undefined,
  };
}

export function bindCheckpoint(
  checkpoint: CapabilityStep["checkpoint"],
  exact: Array<{ name: string; value: string }>,
): CapabilityStep["checkpoint"] {
  if (!checkpoint) return checkpoint;
  if (checkpoint.type === "url") {
    return { ...checkpoint, pattern: templateExact(checkpoint.pattern, exact) };
  }
  if (checkpoint.type === "element-visible") {
    return {
      ...checkpoint,
      target: bindTargetDescriptor(checkpoint.target, exact),
    };
  }
  if (checkpoint.type === "element-text" || checkpoint.type === "value") {
    return {
      ...checkpoint,
      target: bindTargetDescriptor(checkpoint.target, exact),
      expected: templateExact(checkpoint.expected, exact),
    };
  }
  if (checkpoint.type === "count") {
    return {
      ...checkpoint,
      target: bindTargetDescriptor(checkpoint.target, exact),
    };
  }
  if (checkpoint.type === "composite") {
    return {
      ...checkpoint,
      checks: checkpoint.checks.map(
        (c) => bindCheckpoint(c, exact) as NonNullable<CapabilityStep["checkpoint"]>,
      ),
    };
  }
  return checkpoint;
}
