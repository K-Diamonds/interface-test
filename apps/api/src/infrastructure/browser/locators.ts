import type { Locator, Page } from "playwright-core";
import { LocatorKind, type LocatorStrategy } from "@cu/contracts";
import { LocatorError } from "../../core/errors.js";

export function atomicStrategyToLocator(
  page: Page,
  strategy: LocatorStrategy,
): Locator {
  switch (strategy.kind) {
    case "role":
      return page.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], {
        name: strategy.name,
        exact: strategy.exact,
      });
    case "label":
      return page.getByLabel(strategy.text);
    case "text":
      return page.getByText(strategy.text, { exact: strategy.exact });
    case "placeholder":
      return page.getByPlaceholder(strategy.text);
    case "testId":
      return page.locator(
        `[data-test="${strategy.testId}"], [data-testid="${strategy.testId}"]`,
      );
    case "css":
      return page.locator(strategy.selector);
    case "xpath":
      return page.locator(`xpath=${strategy.selector}`);
    case "accessibility":
      return page.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], {
        name: strategy.name,
      });
    case "vision":
      throw new Error(
        `Vision locator strategy is not implemented: ${strategy.description}`,
      );
    case "relative":
      throw new Error("Relative locators must be resolved via resolveRelativeLocator");
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Unknown locator strategy: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export async function resolveRelativeLocator(
  page: Page,
  strategy: Extract<LocatorStrategy, { kind: "relative" }>,
): Promise<Locator> {
  const anchor = await firstMatch(page, [
    strategy.anchor.primary,
    ...strategy.anchor.fallbacks,
  ]);
  const targetStrategies = [strategy.target.primary, ...strategy.target.fallbacks];

  switch (strategy.relationship) {
    case "descendant": {
      const found = await uniqueInScope(anchor, targetStrategies, strategy);
      if (!found) {
        throw new LocatorError(
          "Relative descendant target not found",
          "locator_unresolved",
          strategy,
        );
      }
      return found;
    }
    case "ancestor": {
      const ancestor = anchor.locator("xpath=ancestor::*").first();
      const found = await uniqueInScope(ancestor, targetStrategies, strategy);
      if (!found) {
        throw new LocatorError(
          "Relative ancestor target not found",
          "locator_unresolved",
          strategy,
        );
      }
      return found;
    }
    case "following": {
      const following = anchor.locator("xpath=following::*");
      const found = await uniqueInScope(following, targetStrategies, strategy);
      if (!found) {
        throw new LocatorError(
          "Relative following target not found",
          "locator_unresolved",
          strategy,
        );
      }
      return found;
    }
    case "nearest":
    case "same-container":
      return climbForUniqueTarget(anchor, targetStrategies, strategy);
    default: {
      const _exhaustive: never = strategy.relationship;
      throw new Error(`Unknown relationship ${_exhaustive}`);
    }
  }
}

async function uniqueInScope(
  scope: Locator,
  targetStrategies: LocatorStrategy[],
  strategy: Extract<LocatorStrategy, { kind: "relative" }>,
): Promise<Locator | null> {
  for (const inner of targetStrategies) {
    if (inner.kind === "relative" || inner.kind === "vision") continue;
    const locator = scopedLocator(scope, inner);
    const count = await locator.count().catch(() => 0);
    if (count === 1) return locator.first();
    if (count > 1) {
      throw new LocatorError(
        `Ambiguous relative target (${count} matches)`,
        "locator_ambiguous",
        strategy,
        { count },
      );
    }
  }
  return null;
}

async function climbForUniqueTarget(
  anchor: Locator,
  targetStrategies: LocatorStrategy[],
  strategy: Extract<LocatorStrategy, { kind: "relative" }>,
): Promise<Locator> {
  let scope: Locator = anchor;
  for (let depth = 0; depth < 12; depth++) {
    const found = await uniqueInScope(scope, targetStrategies, strategy);
    if (found) return found;
    scope = scope.locator("xpath=..");
    if ((await scope.count().catch(() => 0)) === 0) break;
  }
  throw new LocatorError(
    `Relative ${strategy.relationship} target not found`,
    "locator_unresolved",
    strategy,
  );
}

function scopedLocator(scope: Locator, strategy: LocatorStrategy): Locator {
  switch (strategy.kind) {
    case "role":
      return scope.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], {
        name: strategy.name,
        exact: strategy.exact,
      });
    case "text":
      return scope.getByText(strategy.text, { exact: strategy.exact });
    case "label":
      return scope.getByLabel(strategy.text);
    case "placeholder":
      return scope.getByPlaceholder(strategy.text);
    case "testId":
      return scope.locator(
        `[data-test="${strategy.testId}"], [data-testid="${strategy.testId}"]`,
      );
    case "css":
      return scope.locator(strategy.selector);
    case "xpath":
      return scope.locator(`xpath=${strategy.selector}`);
    case "accessibility":
      return scope.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], {
        name: strategy.name,
      });
    default:
      return scope.locator("xpath=.");
  }
}

async function firstMatch(
  page: Page,
  strategies: LocatorStrategy[],
): Promise<Locator> {
  for (const strategy of strategies) {
    if (strategy.kind === "relative" || strategy.kind === "vision") continue;
    const locator = atomicStrategyToLocator(page, strategy);
    if ((await locator.count().catch(() => 0)) > 0) return locator.first();
  }
  throw new LocatorError("Relative anchor not found", "locator_unresolved");
}

export async function locatorForStrategy(
  page: Page,
  strategy: LocatorStrategy,
): Promise<Locator> {
  if (strategy.kind === "relative") {
    return resolveRelativeLocator(page, strategy);
  }
  return atomicStrategyToLocator(page, strategy);
}

export function strategyKind(strategy: LocatorStrategy): LocatorKind {
  return strategy.kind;
}
