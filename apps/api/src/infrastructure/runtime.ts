import { loadConfig } from "./config.js";
import {
  getBrowserRuntimeKindOverride,
  getRuntimeProbeOverride,
  getSessionFactoryOverride,
} from "./runtime-overrides.js";
import type { BrowserSessionFactory } from "./browser/session-factory.js";
import { AiProvider, ComponentHealth } from "@cu/contracts";
import { HttpError } from "../core/errors.js";
import { hostedPersistenceConfigured, probeObjectStore } from "./persistence/object-store.js";
import {
  BrowserbaseReadinessCode,
  PersistenceReadinessCode,
  type BrowserbaseReadiness,
} from "./browser/browserbase/browserbase-readiness.js";
import { HOSTED_BROWSERBASE_PROJECT_ID } from "./browser/browserbase/hosted-project.js";

export type BrowserRuntimeKind = "local" | "browserbase";

export function hostedNodeRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * Vercel is always Browserbase. Local development is always Chromium.
 * Tests may override via setBrowserRuntimeKindForTests.
 */
export function browserRuntimeKind(): BrowserRuntimeKind {
  const override = getBrowserRuntimeKindOverride();
  if (override) return override;
  return hostedNodeRuntime() ? "browserbase" : "local";
}

export function browserbaseCredentialsPresent(): boolean {
  return Boolean(loadConfig().browser.browserbase.apiKey);
}

export function hostedBrowserbaseProjectIdPresent(): boolean {
  return Boolean(HOSTED_BROWSERBASE_PROJECT_ID);
}

export async function createRuntimeSessionFactory(): Promise<BrowserSessionFactory> {
  const override = getSessionFactoryOverride();
  if (override) return override;
  const useBrowserbase =
    browserRuntimeKind() === "browserbase" && browserbaseCredentialsPresent();
  if (useBrowserbase) {
    const { createBrowserbaseSessionFactory } = await import(
      "./browser/browserbase/browserbase-session-factory.js"
    );
    return createBrowserbaseSessionFactory();
  }
  if (hostedNodeRuntime()) {
    throw new HttpError(
      501,
      BrowserbaseReadinessCode.ApiKeyMissing,
      "Hosted execution requires BROWSERBASE_API_KEY.",
    );
  }
  const { createLocalPlaywrightSessionFactory } = await import(
    "./browser/local/local-session-factory.js"
  );
  return createLocalPlaywrightSessionFactory();
}

export async function probeBrowserbaseReadiness(): Promise<BrowserbaseReadiness> {
  const override = getRuntimeProbeOverride();
  if (override) {
    const ok = await override();
    return {
      ok,
      code: ok
        ? BrowserbaseReadinessCode.Ok
        : BrowserbaseReadinessCode.ReadinessFailed,
    };
  }
  if (!browserbaseCredentialsPresent()) {
    return { ok: false, code: BrowserbaseReadinessCode.ApiKeyMissing };
  }
  if (!hostedBrowserbaseProjectIdPresent()) {
    return { ok: false, code: BrowserbaseReadinessCode.ProjectInvalid };
  }
  try {
    const { createBrowserbaseGateway } = await import(
      "./browser/browserbase/browserbase-client.js"
    );
    return createBrowserbaseGateway().diagnose();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Cannot find module|Cannot find package|MODULE_NOT_FOUND/i.test(message)) {
      return { ok: false, code: BrowserbaseReadinessCode.SdkError };
    }
    return { ok: false, code: BrowserbaseReadinessCode.ReadinessFailed };
  }
}

export async function probeBrowserbaseReady(): Promise<boolean> {
  return (await probeBrowserbaseReadiness()).ok;
}

/**
 * Hosted live execution is available only when the remote browser is ready
 * and durable object storage can hold artifacts/session metadata.
 */
export async function probeHostedExecutionReady(): Promise<boolean> {
  if (!browserbaseCredentialsPresent()) return false;
  if (!hostedPersistenceConfigured()) return false;
  const [browser, storage] = await Promise.all([
    probeBrowserbaseReady(),
    probeObjectStore(),
  ]);
  return browser && storage;
}

export async function resolveExecutionHealth(hosted: boolean): Promise<{
  browserRuntime: "available" | "unavailable";
  discovery: boolean;
  replay: boolean;
  humanControl: boolean;
  browserReady: boolean;
  persistenceReady: boolean;
  modelReady: boolean;
  browserProvider?: "local" | "browserbase";
  browserRuntimeReason?: string;
  component: ComponentHealth;
  modelComponent: ComponentHealth;
}> {
  if (!hosted) {
    return {
      browserRuntime: "available",
      discovery: true,
      replay: true,
      humanControl: true,
      browserReady: true,
      persistenceReady: true,
      modelReady: true,
      browserProvider: "local",
      component: ComponentHealth.Operational,
      modelComponent: ComponentHealth.Configured,
    };
  }
  const cfg = loadConfig();
  const browserProbe = await probeBrowserbaseReadiness();
  const browserReady = browserProbe.ok;
  const persistenceReady =
    hostedPersistenceConfigured() && (await probeObjectStore());
  const modelReady =
    (cfg.ai.provider === AiProvider.OpenAI && Boolean(cfg.openai.apiKey)) ||
    (cfg.ai.provider === AiProvider.Gemini && Boolean(cfg.gemini.apiKey)) ||
    (cfg.ai.provider === AiProvider.Ollama && Boolean(cfg.ollama.baseUrl));
  const replay = browserReady && persistenceReady;
  const discovery = replay && modelReady;
  let browserRuntimeReason: string | undefined;
  if (!browserReady) browserRuntimeReason = browserProbe.code;
  else if (!persistenceReady) {
    browserRuntimeReason = PersistenceReadinessCode.NotConfigured;
  }
  const component = browserReady
    ? ComponentHealth.Operational
    : browserProbe.code === BrowserbaseReadinessCode.ApiKeyMissing
      ? ComponentHealth.NotConfigured
      : ComponentHealth.Unreachable;
  return {
    browserRuntime: browserReady ? "available" : "unavailable",
    discovery,
    replay,
    humanControl: replay,
    browserReady,
    persistenceReady,
    modelReady,
    browserProvider: "browserbase",
    browserRuntimeReason,
    component,
    modelComponent: modelReady
      ? ComponentHealth.Configured
      : ComponentHealth.NotConfigured,
  };
}
