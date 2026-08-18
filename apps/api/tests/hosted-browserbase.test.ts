import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createHostedControlPlaneApp } from "../src/interfaces/http/hosted-app.js";
import { resolveRepoRoot } from "../src/infrastructure/paths.js";
import { resetConfigCache } from "../src/infrastructure/config.js";
import {
  resetRuntimeOverridesForTests,
  setBrowserRuntimeKindForTests,
  setObjectStoreForTests,
  setRuntimeProbeForTests,
  setSessionFactoryForTests,
} from "../src/infrastructure/runtime-overrides.js";
import { MemoryObjectStore } from "../src/infrastructure/persistence/object-store.js";
import { createHostedSessionRegistry } from "../src/infrastructure/persistence/hosted-session-registry.js";
import {
  CapabilityStatus,
  Controller,
  ReplayExecutionContext,
  SessionExecutionState,
} from "@cu/contracts";
import {
  mockRemoteSessionFactory,
  mockSurface,
} from "./helpers/mock-session.js";
import { replayCapabilityApp } from "../src/application/replay-capability.js";
import { CapabilityStore } from "../src/core/capability/capability-store.js";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

function enableHostedRuntime(): void {
  setBrowserRuntimeKindForTests("browserbase");
  process.env.BROWSERBASE_API_KEY = "test-key";
  resetConfigCache();
  setRuntimeProbeForTests(async () => true);
  setObjectStoreForTests(new MemoryObjectStore());
  setSessionFactoryForTests(mockRemoteSessionFactory("bb_sess_same"));
}

afterEach(() => {
  resetRuntimeOverridesForTests();
  delete process.env.BROWSERBASE_API_KEY;
  resetConfigCache();
});

describe("hosted Browserbase control plane", () => {
  let close: (() => Promise<void>) | undefined;
  let base = "";

  beforeAll(async () => {
    enableHostedRuntime();
    const app = createHostedControlPlaneApp({ rootDir: resolveRepoRoot() });
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    base = `http://127.0.0.1:${port}`;
    close = () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
  });

  afterAll(async () => {
    await close?.();
  });

  it("reports browser runtime available", async () => {
    enableHostedRuntime();
    const res = await fetch(`${base}/api/health`);
    const body = (await res.json()) as {
      execution: {
        browserRuntime: string;
        discovery: boolean;
        replay: boolean;
        browserRuntimeProvider?: string;
      };
      components: { browserRuntime: string; browserProvider?: string };
    };
    expect(body.execution.browserRuntime).toBe("available");
    expect(body.execution.discovery).toBe(true);
    expect(body.execution.replay).toBe(true);
    expect(body.components.browserRuntime).toBe("operational");
    expect(body.components.browserProvider).toBe("browserbase");
    expect(body.execution.browserRuntimeProvider).toBe("browserbase");
  });

  it("accepts hosted discovery without LOCAL_RUNTIME_REQUIRED", async () => {
    enableHostedRuntime();
    const res = await fetch(`${base}/api/discovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: "Add Sauce Labs Backpack to the cart",
        target: "https://www.saucedemo.com",
        scripted: true,
        timeoutSeconds: 30,
        maxSteps: 8,
      }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { runId: string };
    expect(body.runId).toMatch(/^run_/);
  });

  it("accepts hosted replay", async () => {
    enableHostedRuntime();
    const res = await fetch(`${base}/api/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capabilityId: "cart.add-product",
        version: 2,
        inputs: { productName: "Sauce Labs Backpack" },
      }),
    });
    expect(res.status).toBe(202);
  });

  it("accepts hosted agent invoke", async () => {
    enableHostedRuntime();
    const res = await fetch(
      `${base}/api/agent/capabilities/cart.add-product/versions/2/invoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arguments: { productName: "Sauce Labs Backpack" },
        }),
      },
    );
    expect(res.status).not.toBe(501);
  });

  it("does not expose external session identity in hosted intervention detail", async () => {
    enableHostedRuntime();
    const registry = createHostedSessionRegistry();
    await registry.put({
      runId: "run_detail",
      externalSessionId: "bb_sess_hidden",
      controller: Controller.Human,
      executionState: SessionExecutionState.HumanControl,
      interventionId: "int_detail",
      mode: "replay",
      updatedAt: new Date().toISOString(),
    });
    const res = await fetch(`${base}/api/interventions/int_detail`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.externalSessionId).toBeUndefined();
    expect(body.liveViewUrl === undefined || typeof body.liveViewUrl === "string").toBe(true);
  });
});

describe("same-session resume", () => {
  it("reconnects the same external session id", async () => {
    enableHostedRuntime();
    const ids: string[] = [];
    setSessionFactoryForTests({
      async create() {
        ids.push("bb_sess_same");
        return {
          surface: mockSurface(),
          externalSessionId: "bb_sess_same",
          disconnect: async () => undefined,
          terminate: async () => undefined,
        };
      },
      async reconnect(id: string) {
        ids.push(id);
        return {
          surface: mockSurface(),
          externalSessionId: id,
          disconnect: async () => undefined,
          terminate: async () => undefined,
        };
      },
    });
    const registry = createHostedSessionRegistry();
    await registry.put({
      runId: "run_resume",
      externalSessionId: "bb_sess_same",
      controller: Controller.Human,
      executionState: SessionExecutionState.HumanControl,
      capabilityId: "cart.add-product",
      capabilityVersion: 2,
      currentStepId: "step_1",
      interventionId: "int_resume",
      mode: "replay",
      inputs: {
        productName: "Sauce Labs Backpack",
        username: "standard_user",
        password: "secret_sauce",
      },
      updatedAt: new Date().toISOString(),
    });
    const { resumeHostedIntervention } = await import(
      "../src/application/interventions/hosted.js"
    );
    await resumeHostedIntervention("int_resume");
    expect(ids.at(-1)).toBe("bb_sess_same");
    expect(ids).not.toContain("create-new");
  });

  it("preserves unattended replay governance across resume", async () => {
    enableHostedRuntime();
    const rootDir = await mkdtemp(path.join(tmpdir(), "interface-test-hosted-resume-"));
    const store = new CapabilityStore(rootDir);
    const raw = JSON.parse(
      await readFile(
        path.join(
          resolveRepoRoot(),
          "artifacts/capabilities/cart.add-product/v2.json",
        ),
        "utf8",
      ),
    ) as { capability: { id: string; version: number; status: CapabilityStatus } };
    raw.capability.id = `hosted.resume.draft.${Date.now()}`;
    raw.capability.version = 1;
    raw.capability.status = CapabilityStatus.Draft;
    await store.save(raw as never);

    const registry = createHostedSessionRegistry();
    await registry.put({
      runId: "run_unattended_resume",
      externalSessionId: "bb_sess_same",
      controller: Controller.Human,
      executionState: SessionExecutionState.HumanControl,
      capabilityId: raw.capability.id,
      capabilityVersion: raw.capability.version,
      currentStepId: "step_1",
      interventionId: "int_unattended_resume",
      mode: "replay",
      executionContext: ReplayExecutionContext.Unattended,
      allowDraft: false,
      inputs: {
        productName: "Sauce Labs Backpack",
      },
      updatedAt: new Date().toISOString(),
    });

    const { resumeHostedIntervention } = await import(
      "../src/application/interventions/hosted.js"
    );
    await expect(
      resumeHostedIntervention("int_unattended_resume"),
    ).rejects.toMatchObject({ code: "CAPABILITY_NOT_APPROVED" });
  });

  it("persists a hosted capability so a later replay can load it", async () => {
    enableHostedRuntime();
    const store = new MemoryObjectStore();
    setObjectStoreForTests(store);
    const rootDir = await mkdtemp(path.join(tmpdir(), "interface-test-hosted-cap-"));
    await mkdir(rootDir, { recursive: true });
    const cap = new CapabilityStore(rootDir);
    const raw = JSON.parse(
      await readFile(
        path.join(
          resolveRepoRoot(),
          "artifacts/capabilities/cart.add-product/v2.json",
        ),
        "utf8",
      ),
    ) as { capability: { id: string; version: number } };
    raw.capability.id = "hosted.persisted";
    raw.capability.version = 1;
    await cap.save(raw as never);
    const keys = await store.list("artifacts/capabilities/hosted.persisted/");
    expect(keys.some((k) => k.endsWith("v1.json"))).toBe(true);
    const loaded = await new CapabilityStore(rootDir).get("hosted.persisted", 1);
    expect(loaded.capability.id).toBe("hosted.persisted");
  });
});

describe("replay through remote surface", () => {
  it("uses the injected remote factory rather than LOCAL_RUNTIME_REQUIRED", async () => {
    enableHostedRuntime();
    const result = await replayCapabilityApp({
      capabilityId: "cart.add-product",
      version: 2,
      inputs: {
        productName: "Sauce Labs Backpack",
        username: "standard_user",
        password: "secret_sauce",
      },
      allowDraft: true,
      options: {
        rootDir: resolveRepoRoot(),
        evidenceRoot: path.join(tmpdir(), `ev-${Date.now()}`),
        createSurface: async () => mockSurface(),
        closeSurface: false,
      },
    });
    expect(result.status).not.toBeUndefined();
  });
});
