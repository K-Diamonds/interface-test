import { afterEach, describe, expect, it } from "vitest";
import { resetConfigCache } from "../src/infrastructure/config.js";
import {
  resetRuntimeOverridesForTests,
  setBrowserRuntimeKindForTests,
  setObjectStoreForTests,
  setRuntimeProbeForTests,
} from "../src/infrastructure/runtime-overrides.js";
import { setBrowserbaseGatewayForTests } from "../src/infrastructure/browser/browserbase/browserbase-client.js";
import {
  browserRuntimeKind,
  createRuntimeSessionFactory,
  probeBrowserbaseReadiness,
  probeHostedExecutionReady,
  resolveExecutionHealth,
} from "../src/infrastructure/runtime.js";
import {
  classifyBrowserbaseError,
  BrowserbaseReadinessCode,
  PersistenceReadinessCode,
} from "../src/infrastructure/browser/browserbase/browserbase-readiness.js";
import { HOSTED_BROWSERBASE_PROJECT_ID } from "../src/infrastructure/browser/browserbase/hosted-project.js";
import { MemoryObjectStore } from "../src/infrastructure/persistence/object-store.js";
import { createLocalPlaywrightSessionFactory } from "../src/infrastructure/browser/local/local-session-factory.js";
import { createBrowserbaseSessionFactory } from "../src/infrastructure/browser/browserbase/browserbase-session-factory.js";
import { readFileSync } from "node:fs";
import path from "node:path";

afterEach(() => {
  resetRuntimeOverridesForTests();
  setBrowserbaseGatewayForTests(undefined);
  delete process.env.BROWSERBASE_API_KEY;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL;
  resetConfigCache();
});

describe("browser runtime selection", () => {
  it("selects the local session factory by default", async () => {
    resetConfigCache();
    expect(browserRuntimeKind()).toBe("local");
    const factory = await createRuntimeSessionFactory();
    expect(factory.reconnect).toBeUndefined();
    const local = createLocalPlaywrightSessionFactory();
    expect(Object.keys(factory)).toEqual(Object.keys(local));
  });

  it("selects the Browserbase session factory when configured", async () => {
    setBrowserRuntimeKindForTests("browserbase");
    process.env.BROWSERBASE_API_KEY = "test-key";
    resetConfigCache();
    const created: string[] = [];
    setBrowserbaseGatewayForTests({
      createSession: async () => {
        created.push("create");
        return {
          id: "sess_1",
          connectUrl: "wss://example.invalid/cdp",
          status: "RUNNING",
        };
      },
      retrieveSession: async (id) => ({
        id,
        connectUrl: "wss://example.invalid/cdp",
        status: "RUNNING",
      }),
      debugSession: async () => ({
        debuggerFullscreenUrl: "https://example.invalid/live",
      }),
      requestRelease: async () => undefined,
      ping: async () => true,
      diagnose: async () => ({ ok: true, code: "OK" }),
    });
    const factory = await createRuntimeSessionFactory();
    expect(factory.reconnect).toBeTypeOf("function");
    expect(createBrowserbaseSessionFactory().reconnect).toBeTypeOf("function");
    expect(created).toEqual([]);
  });

  it("hosted execution is unavailable without a ready Browserbase probe", async () => {
    setBrowserRuntimeKindForTests("browserbase");
    process.env.BROWSERBASE_API_KEY = "test-key";
    resetConfigCache();
    setRuntimeProbeForTests(async () => false);
    setObjectStoreForTests(new MemoryObjectStore());
    expect(await probeHostedExecutionReady()).toBe(false);
  });

  it("hosted execution is available when probe and persistence are ready", async () => {
    setBrowserRuntimeKindForTests("browserbase");
    process.env.BROWSERBASE_API_KEY = "test-key";
    resetConfigCache();
    setRuntimeProbeForTests(async () => true);
    setObjectStoreForTests(new MemoryObjectStore());
    expect(await probeHostedExecutionReady()).toBe(true);
  });

  it("Vercel defaults to browserbase and reports BROWSERBASE_API_KEY_MISSING without the key", async () => {
    process.env.VERCEL = "1";
    process.env.BROWSERBASE_API_KEY = "";
    resetConfigCache();
    expect(browserRuntimeKind()).toBe("browserbase");
    const probe = await probeBrowserbaseReadiness();
    expect(probe.ok).toBe(false);
    expect(probe.code).toBe(BrowserbaseReadinessCode.ApiKeyMissing);
  });

  it("Vercel hosted execution is unavailable without BLOB_READ_WRITE_TOKEN", async () => {
    process.env.VERCEL = "1";
    process.env.BROWSERBASE_API_KEY = "test-key";
    process.env.BLOB_READ_WRITE_TOKEN = "";
    resetConfigCache();
    setRuntimeProbeForTests(async () => true);
    expect(await probeHostedExecutionReady()).toBe(false);
    const health = await resolveExecutionHealth(true);
    expect(health.browserProvider).toBe("browserbase");
    expect(health.browserReady).toBe(true);
    expect(health.persistenceReady).toBe(false);
    expect(health.replay).toBe(false);
    expect(health.humanControl).toBe(false);
    expect(health.browserRuntimeReason).toBe(
      PersistenceReadinessCode.NotConfigured,
    );
  });

  it("Vercel hosted execution is ready with Browserbase key and blob persistence", async () => {
    process.env.VERCEL = "1";
    process.env.BROWSERBASE_API_KEY = "test-key";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    resetConfigCache();
    setRuntimeProbeForTests(async () => true);
    setObjectStoreForTests(new MemoryObjectStore());
    expect(await probeHostedExecutionReady()).toBe(true);
  });

  it("does not fall back to a local factory on Vercel", async () => {
    process.env.VERCEL = "1";
    process.env.BROWSERBASE_API_KEY = "";
    resetConfigCache();
    await expect(createRuntimeSessionFactory()).rejects.toMatchObject({
      code: BrowserbaseReadinessCode.ApiKeyMissing,
    });
  });

  it("uses the hardcoded Browserbase project id rather than an env var", () => {
    expect(HOSTED_BROWSERBASE_PROJECT_ID.length).toBeGreaterThan(0);
    const configSrc = readFileSync(
      path.join(process.cwd(), "src/infrastructure/config.ts"),
      "utf8",
    );
    expect(configSrc).not.toMatch(/process\.env\.BROWSER_RUNTIME/);
    expect(configSrc).not.toMatch(/process\.env\.BROWSERBASE_PROJECT_ID/);
    expect(configSrc).toMatch(/HOSTED_BROWSERBASE_PROJECT_ID/);
  });

  it("classifies Browserbase errors without leaking secrets", () => {
    expect(
      classifyBrowserbaseError({ name: "AuthenticationError", status: 401 }),
    ).toBe(BrowserbaseReadinessCode.AuthFailed);
    expect(
      classifyBrowserbaseError({ name: "NotFoundError", status: 404 }),
    ).toBe(BrowserbaseReadinessCode.ProjectInvalid);
    expect(
      classifyBrowserbaseError(new Error("Cannot find package '@browserbasehq/sdk'")),
    ).toBe(BrowserbaseReadinessCode.SdkError);
    expect(
      classifyBrowserbaseError({ name: "APIConnectionError" }),
    ).toBe(BrowserbaseReadinessCode.ApiUnreachable);
    expect(PersistenceReadinessCode.NotConfigured).toBe("BLOB_STORAGE_NOT_CONFIGURED");
  });
});
