import type { LocatorStrategy, NestedLocatorRef, TargetDescriptor } from "@cu/contracts";

/**
 * Parameter binding: replace {{param}} templates with runtime input values.
 * Pure — no Playwright / surface dependencies.
 */
export function bindTemplate(
  template: string,
  inputs: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) => {
    const value = inputs[name];
    if (value === undefined || value === null) {
      throw new Error(`Missing parameter for template {{${name}}}`);
    }
    return String(value);
  });
}

export function bindLocatorStrategy(
  strategy: LocatorStrategy,
  inputs: Record<string, unknown>,
): LocatorStrategy {
  switch (strategy.kind) {
    case "role":
      return {
        ...strategy,
        name: strategy.name ? bindTemplate(strategy.name, inputs) : undefined,
      };
    case "label":
    case "text":
    case "placeholder":
      return { ...strategy, text: bindTemplate(strategy.text, inputs) };
    case "testId":
      return { ...strategy, testId: bindTemplate(strategy.testId, inputs) };
    case "css":
    case "xpath":
      return { ...strategy, selector: bindTemplate(strategy.selector, inputs) };
    case "accessibility":
      return {
        ...strategy,
        name: strategy.name ? bindTemplate(strategy.name, inputs) : undefined,
      };
    case "relative":
      return {
        ...strategy,
        anchor: {
          primary: bindAtomicLocator(strategy.anchor.primary, inputs),
          fallbacks: strategy.anchor.fallbacks.map((f) =>
            bindAtomicLocator(f, inputs),
          ),
        },
        target: {
          primary: bindAtomicLocator(strategy.target.primary, inputs),
          fallbacks: strategy.target.fallbacks.map((f) =>
            bindAtomicLocator(f, inputs),
          ),
        },
      };
    case "vision":
      return {
        ...strategy,
        description: bindTemplate(strategy.description, inputs),
      };
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

function bindAtomicLocator(
  strategy: NestedLocatorRef["primary"],
  inputs: Record<string, unknown>,
): NestedLocatorRef["primary"] {
  return bindLocatorStrategy(strategy, inputs) as NestedLocatorRef["primary"];
}

export function bindTarget(
  target: TargetDescriptor,
  inputs: Record<string, unknown>,
): TargetDescriptor {
  return {
    ...target,
    description: bindTemplate(target.description, inputs),
    primary: bindLocatorStrategy(target.primary, inputs),
    fallbacks: target.fallbacks.map((f) => bindLocatorStrategy(f, inputs)),
    expected: target.expected
      ? {
          ...target.expected,
          text: target.expected.text
            ? bindTemplate(target.expected.text, inputs)
            : undefined,
          nearbyText: target.expected.nearbyText?.map((t) =>
            bindTemplate(t, inputs),
          ),
        }
      : undefined,
  };
}
