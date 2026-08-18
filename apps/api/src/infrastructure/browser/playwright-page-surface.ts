import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import { LocatorError, RecoverableError } from "../../core/errors.js";
import type { ComputerSurface } from "../../core/surface.js";
import type {
  ActionResult,
  SurfaceCondition,
  SurfaceObservation,
  TargetDescriptor,
} from "@cu/contracts";
import { DriftSignal } from "@cu/contracts";
import { AccessibilityObservationProvider } from "./observation/accessibility-observation-provider.js";
import { locatorForStrategy, strategyKind } from "./locators.js";

const SURFACE_WAIT_TIMEOUT_MS = 15_000;
const SURFACE_NAVIGATION_TIMEOUT_MS = 30_000;
const SURFACE_ACTION_TIMEOUT_MS = 10_000;

export interface PlaywrightPageAttachOptions {
  page: Page;
  context?: BrowserContext | null;
  browser?: Browser | null;
  /** When true, close() shuts the browser (local Chromium). */
  ownsBrowser?: boolean;
  /** Extra cleanup (Browserbase disconnect / session release). */
  onClose?: () => Promise<void>;
}

function cssEscape(value: string): string {
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

/**
 * Observation/action adapter over an already-connected Playwright Page.
 * Browser lifecycle belongs to a BrowserSessionFactory.
 */
export class PlaywrightPageSurface implements ComputerSurface {
  private browser: Browser | null;
  private context: BrowserContext | null;
  private page: Page;
  private readonly ownsBrowser: boolean;
  private readonly onClose?: () => Promise<void>;
  private closed = false;
  private readonly observation = new AccessibilityObservationProvider();

  private constructor(options: PlaywrightPageAttachOptions) {
    this.page = options.page;
    this.context = options.context ?? null;
    this.browser = options.browser ?? null;
    this.ownsBrowser = options.ownsBrowser ?? false;
    this.onClose = options.onClose;
  }

  static attach(options: PlaywrightPageAttachOptions): PlaywrightPageSurface {
    return new PlaywrightPageSurface(options);
  }

  async observe(): Promise<SurfaceObservation> {
    await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    return this.observation.observe(this.page);
  }

  async navigate(url: string): Promise<ActionResult> {
    const started = Date.now();
    const response = await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: SURFACE_NAVIGATION_TIMEOUT_MS,
    });
    return {
      ok: Boolean(response && response.ok()),
      message: response ? `HTTP ${response.status()}` : "navigated",
      durationMs: Date.now() - started,
      redirectedTo: this.page.url(),
    };
  }

  async click(target: TargetDescriptor): Promise<ActionResult> {
    const started = Date.now();
    const resolved = await this.resolveUnique(target);
    try {
      await resolved.locator.click({ timeout: SURFACE_ACTION_TIMEOUT_MS });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/detached|stale/i.test(message)) {
        throw new RecoverableError(message, "element_detached");
      }
      throw err;
    }
    return {
      ok: true,
      durationMs: Date.now() - started,
      redirectedTo: this.page.url(),
      ...resolved.meta,
    };
  }

  async type(target: TargetDescriptor, value: string): Promise<ActionResult> {
    const started = Date.now();
    const resolved = await this.resolveUnique(target);
    await resolved.locator.fill(value, { timeout: SURFACE_ACTION_TIMEOUT_MS });
    return { ok: true, durationMs: Date.now() - started, ...resolved.meta };
  }

  async select(target: TargetDescriptor, value: string): Promise<ActionResult> {
    const started = Date.now();
    const resolved = await this.resolveUnique(target);
    await resolved.locator.selectOption(value, { timeout: SURFACE_ACTION_TIMEOUT_MS });
    return { ok: true, durationMs: Date.now() - started, ...resolved.meta };
  }

  async read(target: TargetDescriptor): Promise<string> {
    const resolved = await this.resolveUnique(target);
    const text = await resolved.locator.innerText().catch(async () => {
      return resolved.locator.inputValue().catch(() => "");
    });
    return text.trim();
  }

  async count(target: TargetDescriptor): Promise<number> {
    const strategies = [target.primary, ...target.fallbacks];
    for (const strategy of strategies) {
      try {
        const locator = await locatorForStrategy(this.page, strategy);
        const n = await locator.count();
        if (n > 0) return n;
      } catch {
        // try next strategy
      }
    }
    return 0;
  }

  async waitFor(condition: SurfaceCondition): Promise<void> {
    switch (condition.type) {
      case "timeout":
        await this.page.waitForTimeout(condition.ms);
        return;
      case "url":
        await this.page.waitForURL(
          (url) => new RegExp(condition.pattern).test(url.toString()),
          { timeout: SURFACE_WAIT_TIMEOUT_MS },
        );
        return;
      case "text":
        await this.page.getByText(condition.text).first().waitFor({
          state: "visible",
          timeout: SURFACE_WAIT_TIMEOUT_MS,
        });
        return;
      case "element":
        await (await this.resolveUnique(condition.target)).locator.waitFor({
          state: "visible",
          timeout: SURFACE_WAIT_TIMEOUT_MS,
        });
        return;
      default: {
        const _exhaustive: never = condition;
        throw new Error(`Unknown wait condition: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  async screenshot(): Promise<Buffer> {
    return this.page.screenshot({ fullPage: false, type: "png" });
  }

  async getCurrentLocation(): Promise<string> {
    return this.page.url();
  }

  async stopTracing(path: string): Promise<void> {
    if (this.context) {
      await this.context.tracing.stop({ path }).catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.onClose) {
      await this.onClose().catch(() => undefined);
    }
    if (!this.ownsBrowser) return;
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }

  private async resolveUnique(target: TargetDescriptor): Promise<{
    locator: Locator;
    meta: Pick<
      ActionResult,
      "primaryStrategy" | "resolvedStrategy" | "usedFallback" | "driftSignals"
    >;
  }> {
    const strategies = [target.primary, ...target.fallbacks];
    let lastError: Error | undefined;
    const primaryKind = strategyKind(target.primary);

    for (let index = 0; index < strategies.length; index++) {
      const strategy = strategies[index]!;
      try {
        const resolvedStrategy =
          strategy.kind === "css" && strategy.selector.startsWith("#")
            ? {
                ...strategy,
                selector: `#${cssEscape(strategy.selector.slice(1))}`,
              }
            : strategy;

        const locator = await locatorForStrategy(this.page, resolvedStrategy);
        const count = await locator.count();
        if (count === 0) {
          lastError = new LocatorError(
            `No matches for ${JSON.stringify(strategy)}`,
            "locator_unresolved",
            strategy,
            { count: 0 },
          );
          continue;
        }
        if (count > 1) {
          const visible: number[] = [];
          for (let i = 0; i < Math.min(count, 10); i++) {
            if (await locator.nth(i).isVisible().catch(() => false)) {
              visible.push(i);
            }
          }
          if (visible.length === 1) {
            const chosen = locator.nth(visible[0]!);
            await this.validateFingerprint(chosen, target);
            return {
              locator: chosen,
              meta: resolutionMeta(primaryKind, strategyKind(strategy), index > 0),
            };
          }
          throw new LocatorError(
            `Ambiguous locator (${count} matches) for ${target.description}`,
            "locator_ambiguous",
            strategy,
            { count, visible: visible.length },
          );
        }

        const single = locator.first();
        await this.validateFingerprint(single, target);
        return {
          locator: single,
          meta: resolutionMeta(primaryKind, strategyKind(strategy), index > 0),
        };
      } catch (err) {
        if (err instanceof LocatorError && err.category === "locator_ambiguous") {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw (
      lastError ??
      new LocatorError(
        `Unable to resolve target: ${target.description}`,
        "locator_unresolved",
        target,
      )
    );
  }

  private async validateFingerprint(
    locator: Locator,
    target: TargetDescriptor,
  ): Promise<void> {
    const expected = target.expected;
    if (!expected) return;

    if (expected.text) {
      const text = (await locator.innerText().catch(() => "")).trim();
      if (text && !text.includes(expected.text) && expected.text !== text) {
        if (text.length > 0 && expected.text.length > 2) {
          const normalized = text.toLowerCase();
          const want = expected.text.toLowerCase();
          if (!normalized.includes(want) && !want.includes(normalized)) {
            throw new LocatorError(
              `Fingerprint text mismatch for ${target.description}`,
              "locator_unresolved",
              expected,
              { text },
            );
          }
        }
      }
    }

    if (expected.tag) {
      const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
      if (tag !== expected.tag.toLowerCase()) {
        throw new LocatorError(
          `Fingerprint tag mismatch for ${target.description}`,
          "locator_unresolved",
          expected,
          { tag },
        );
      }
    }
  }
}

function resolutionMeta(
  primary: ActionResult["primaryStrategy"],
  resolved: ActionResult["resolvedStrategy"],
  usedFallback: boolean,
): Pick<
  ActionResult,
  "primaryStrategy" | "resolvedStrategy" | "usedFallback" | "driftSignals"
> {
  return {
    primaryStrategy: primary,
    resolvedStrategy: resolved,
    usedFallback,
    driftSignals: usedFallback
      ? [DriftSignal.FallbackLocatorUsed, DriftSignal.PrimaryLocatorFailure]
      : undefined,
  };
}
