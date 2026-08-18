import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  AgentCapabilityDescriptorSchema,
  AgentCapabilityListResponseSchema,
  CapabilityReliabilitySchema,
  CapabilityStatus,
  ReplayExecutionContext,
} from "@cu/contracts";
import type { CapabilityArtifact } from "@cu/contracts";
import type { ComputerSurface } from "../src/core/surface.js";
import type { SurfaceObservation, TargetDescriptor } from "@cu/contracts";
import { startControlPlaneServer } from "../src/interfaces/http/server.js";
import { createHostedControlPlaneApp } from "../src/interfaces/http/hosted-app.js";
import { resolveRepoRoot } from "../src/infrastructure/paths.js";
import { invokeAgentCapability } from "../src/application/agent-invoke.js";
import { replayCapabilityApp } from "../src/application/replay-capability.js";
import { summarizeCapabilityReliability } from "../src/core/capability/reliability.js";
import { assertInvocable } from "../src/core/capability/execution-gate.js";
import { toAgentDescriptor, toOpenAITool } from "../src/core/capability/agent-descriptor.js";
import { CapabilityStore } from "../src/core/capability/capability-store.js";
import { HttpError } from "../src/core/errors.js";
import type { Server } from "node:http";

function createMockSurface(): ComputerSurface {
  let location = "https://www.saucedemo.com/";
  const observation = (): SurfaceObservation => ({
    location,
    title: "Swag Labs",
    controls: [],
    visibleText: ["Sauce Labs Backpack"],
    dialogs: [],
    stateHints: { cartCount: 1 },
    fingerprint: "fp",
  });
  return {
    observe: async () => observation(),
    navigate: async (url) => {
      location = url;
      return { ok: true, durationMs: 1, redirectedTo: url };
    },
    click: async (_target: TargetDescriptor) => {
      location = "https://www.saucedemo.com/cart.html";
      return { ok: true, durationMs: 1, redirectedTo: location };
    },
    type: async () => ({ ok: true, durationMs: 1 }),
    read: async () => "Sauce Labs Backpack",
    waitFor: async () => undefined,
    screenshot: async () => Buffer.from("png"),
    getCurrentLocation: async () => location,
    count: async () => 1,
    close: async () => undefined,
  };
}

function testArtifact(
  status: CapabilityStatus,
  id = "test.agent-cap",
): CapabilityArtifact {
  return {
    schemaVersion: "1.0",
    capability: {
      id,
      name: "Test agent cap",
      description: "typed invoke test",
      version: 1,
      status,
    },
    compatibility: {
      appId: "test",
      targetPatterns: ["https://www.saucedemo.com/**"],
    },
    contract: {
      inputs: [
        {
          name: "productName",
          type: "string",
          required: true,
          description: "product",
        },
      ],
      outputs: [
        { name: "productName", type: "string", description: "p" },
        { name: "cartCount", type: "number", description: "c" },
        { name: "inCart", type: "boolean", description: "i" },
      ],
    },
    policy: {
      allowedDomains: ["www.saucedemo.com", "saucedemo.com"],
      allowedActions: [
        "navigate",
        "click",
        "type",
        "read",
        "wait",
        "extract",
        "checkpoint",
      ],
      riskyActionPolicy: "require-human",
    },
    steps: [
      {
        id: "go",
        type: "navigate",
        description: "go",
        url: "https://www.saucedemo.com/",
        effect: "navigation",
        risk: "low",
      },
      {
        id: "add-product",
        type: "click",
        description: "Add product to cart",
        effect: "reversible-mutation",
        risk: "low",
        target: {
          description: "Add {{productName}}",
          primary: { kind: "text", text: "{{productName}}" },
          fallbacks: [],
        },
      },
      {
        id: "extract",
        type: "extract",
        description: "extract",
        effect: "read",
        risk: "low",
        outputs: [
          {
            name: "productName",
            from: "input",
            inputKey: "productName",
            transform: "string",
          },
          {
            name: "cartCount",
            from: "stateHint",
            stateHintKey: "cartCount",
            transform: "number",
          },
          {
            name: "inCart",
            from: "visible-text-includes",
            inputKey: "productName",
            transform: "boolean",
          },
        ],
      },
    ],
    successCondition: { type: "url", pattern: "cart\\.html" },
    knownOutcomes: [],
    metadata: {
      createdAt: new Date().toISOString(),
      discoveredFromRunId: "run_test",
      generatorVersion: "1.0.0",
    },
  };
}

describe("agent catalog HTTP", () => {
  let close: (() => Promise<void>) | undefined;
  let base = "";

  beforeAll(async () => {
    const handle = await startControlPlaneServer({
      port: 0,
      rootDir: resolveRepoRoot(),
    });
    base = handle.url;
    close = handle.close;
  });

  afterAll(async () => {
    await close?.();
  });

  it("GET /api/agent/capabilities returns callable descriptors", async () => {
    const res = await fetch(`${base}/api/agent/capabilities`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    const parsed = AgentCapabilityListResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    const cart = parsed.data!.items.find(
      (i) => i.id === "cart.add-product" && i.version === 2,
    );
    expect(cart).toBeDefined();
    expect(cart!.name).toBeTruthy();
    expect(cart!.description.length).toBeGreaterThan(0);
    expect(cart!.status).toBe(CapabilityStatus.Approved);
    expect(cart!.invocable).toBe(true);
    expect(cart!.inputs.some((i) => i.name === "productName" && i.type === "string" && i.required)).toBe(
      true,
    );
    expect(cart!.outputs.some((o) => o.name === "cartCount" && o.type === "number")).toBe(
      true,
    );
    expect(cart!.outputs.some((o) => o.name === "inCart" && o.type === "boolean")).toBe(
      true,
    );
    const dumped = JSON.stringify(cart);
    expect(dumped).not.toMatch(/playwright/i);
    expect(dumped).not.toMatch(/recoveryRules/);
    expect(dumped).not.toMatch(/evidence\//);
    expect(dumped).not.toMatch(/primary/);
    expect(dumped).not.toMatch(/fallbacks/);
    expect(dumped).not.toMatch(/password/i);
    expect(cart!.inputs.some((i) => i.name === "username")).toBe(false);
  });

  it("GET descriptor omits internal execution details", async () => {
    const res = await fetch(
      `${base}/api/agent/capabilities/cart.add-product/versions/2`,
    );
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(AgentCapabilityDescriptorSchema.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("steps");
    expect(body).not.toHaveProperty("policy");
    expect(body).not.toHaveProperty("recoveryRules");
  });

  it("rejects missing required argument with 400", async () => {
    const res = await fetch(
      `${base}/api/agent/capabilities/cart.add-product/versions/2/invoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arguments: {} }),
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects wrong primitive type with 400", async () => {
    const res = await fetch(
      `${base}/api/agent/capabilities/cart.add-product/versions/2/invoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arguments: { productName: 12 } }),
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown capability with 404", async () => {
    const res = await fetch(
      `${base}/api/agent/capabilities/does.not.exist/versions/1/invoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arguments: { productName: "x" } }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("rejects draft capability on unattended invoke", async () => {
    const res = await fetch(
      `${base}/api/agent/capabilities/cart.add-product.hardfail/versions/1/invoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arguments: { productName: "Sauce Labs Backpack" } }),
      },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CAPABILITY_NOT_APPROVED");
  });
});

describe("hosted agent catalog", () => {
  let close: (() => Promise<void>) | undefined;
  let base = "";

  beforeAll(async () => {
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

  it("serves GET /api/agent/capabilities", async () => {
    const res = await fetch(`${base}/api/agent/capabilities`);
    expect(res.ok).toBe(true);
    expect(
      AgentCapabilityListResponseSchema.safeParse(await res.json()).success,
    ).toBe(true);
  });

  it("does not execute POST invoke", async () => {
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
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("LOCAL_RUNTIME_REQUIRED");
  });
});

describe("agent invocation contract", () => {
  it("valid args invoke existing replay", async () => {
    const rootDir = path.join(tmpdir(), `agent-ok-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    const store = new CapabilityStore(rootDir);
    await store.save(testArtifact(CapabilityStatus.Approved));
    const result = await invokeAgentCapability({
      capabilityId: "test.agent-cap",
      version: 1,
      arguments: { productName: "Sauce Labs Backpack" },
      rootDir,
      replayOptions: {
        rootDir,
        evidenceRoot: path.join(rootDir, "evidence"),
        createSurface: async () => createMockSurface(),
        closeSurface: false,
      },
    });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.outputs.productName).toBe("Sauce Labs Backpack");
      expect(result.runId).toBeTruthy();
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("deprecated capability is rejected", async () => {
    const rootDir = path.join(tmpdir(), `agent-dep-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    await new CapabilityStore(rootDir).save(
      testArtifact(CapabilityStatus.Deprecated),
    );
    await expect(
      invokeAgentCapability({
        capabilityId: "test.agent-cap",
        version: 1,
        arguments: { productName: "Sauce Labs Backpack" },
        rootDir,
        replayOptions: {
          rootDir,
          evidenceRoot: path.join(rootDir, "evidence"),
          createSurface: async () => createMockSurface(),
        },
      }),
    ).rejects.toMatchObject({ status: 409, code: "CAPABILITY_DEPRECATED" });
    await rm(rootDir, { recursive: true, force: true });
  });

  it("approved capability is permitted for unattended invoke", () => {
    expect(() =>
      assertInvocable({
        status: CapabilityStatus.Approved,
        capabilityId: "x",
        version: 1,
        executionContext: ReplayExecutionContext.Unattended,
        allowDraft: false,
      }),
    ).not.toThrow();
  });

  it("draft is rejected for unattended even if allowDraft is set", () => {
    expect(() =>
      assertInvocable({
        status: CapabilityStatus.Draft,
        capabilityId: "x",
        version: 1,
        executionContext: ReplayExecutionContext.Unattended,
        allowDraft: true,
      }),
    ).toThrow(HttpError);
  });

  it("draft development override allows replay when explicitly enabled", async () => {
    const rootDir = path.join(tmpdir(), `agent-draft-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    await new CapabilityStore(rootDir).save(
      testArtifact(CapabilityStatus.Draft),
    );
    const result = await replayCapabilityApp({
      capabilityId: "test.agent-cap",
      version: 1,
      inputs: { productName: "Sauce Labs Backpack" },
      executionContext: ReplayExecutionContext.Development,
      allowDraft: true,
      options: {
        rootDir,
        evidenceRoot: path.join(rootDir, "evidence"),
        createSurface: async () => createMockSurface(),
        closeSurface: false,
      },
    });
    expect(result.status).toBe("success");
    await rm(rootDir, { recursive: true, force: true });
  });

  it("draft without explicit override is rejected", async () => {
    const rootDir = path.join(tmpdir(), `agent-draft-closed-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    await new CapabilityStore(rootDir).save(
      testArtifact(CapabilityStatus.Draft),
    );
    await expect(
      replayCapabilityApp({
        capabilityId: "test.agent-cap",
        version: 1,
        inputs: { productName: "Sauce Labs Backpack" },
        executionContext: ReplayExecutionContext.Development,
        allowDraft: false,
        options: { rootDir },
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_NOT_APPROVED" });
    await rm(rootDir, { recursive: true, force: true });
  });
});

describe("reliability aggregation", () => {
  it("counts success vs business_outcome vs hard failure and withholds fake confidence", async () => {
    const rootDir = path.join(tmpdir(), `rel-${Date.now()}`);
    const replayDir = path.join(rootDir, "evidence", "replay");
    await mkdir(path.join(replayDir, "a"), { recursive: true });
    await mkdir(path.join(replayDir, "b"), { recursive: true });
    await mkdir(path.join(replayDir, "c"), { recursive: true });
    await writeFile(
      path.join(replayDir, "a", "result.json"),
      JSON.stringify({
        status: "success",
        capabilityId: "cart.add-product",
        capabilityVersion: 2,
      }),
    );
    await writeFile(
      path.join(replayDir, "b", "result.json"),
      JSON.stringify({
        status: "business_outcome",
        capabilityId: "cart.add-product",
        capabilityVersion: 2,
      }),
    );
    await writeFile(
      path.join(replayDir, "c", "result.json"),
      JSON.stringify({
        status: "failure",
        capabilityId: "cart.add-product",
        capabilityVersion: 2,
      }),
    );
    const summary = await summarizeCapabilityReliability({
      capabilityId: "cart.add-product",
      version: 2,
      rootDir,
    });
    expect(CapabilityReliabilitySchema.safeParse(summary).success).toBe(true);
    expect(summary.successfulRuns).toBe(1);
    expect(summary.businessOutcomes).toBe(1);
    expect(summary.hardFailures).toBe(1);
    expect(summary.sampleSize).toBe(3);
    expect(summary.executionReliability).toBe(0.5);
    expect(summary.status).toBe("ok");
    expect(summary.approvalReadiness).toBe("degraded");
    expect(JSON.stringify(summary)).not.toMatch(/0\.97/);
    await rm(rootDir, { recursive: true, force: true });
  });

  it("reports insufficient_data for tiny samples", async () => {
    const rootDir = path.join(tmpdir(), `rel-small-${Date.now()}`);
    const replayDir = path.join(rootDir, "evidence", "replay", "only");
    await mkdir(replayDir, { recursive: true });
    await writeFile(
      path.join(replayDir, "result.json"),
      JSON.stringify({
        status: "success",
        capabilityId: "x",
        capabilityVersion: 1,
      }),
    );
    const summary = await summarizeCapabilityReliability({
      capabilityId: "x",
      version: 1,
      rootDir,
    });
    expect(summary.status).toBe("insufficient_data");
    expect(summary.approvalReadiness).toBe("insufficient_data");
    expect(summary.sampleSize).toBe(1);
    await rm(rootDir, { recursive: true, force: true });
  });
});

describe("agent descriptor mapper", () => {
  it("maps a descriptor without exposing locators", () => {
    const descriptor = toAgentDescriptor(
      testArtifact(CapabilityStatus.Approved),
    );
    expect(descriptor.invocable).toBe(true);
    expect(descriptor.inputs[0]?.name).toBe("productName");
    const tool = toOpenAITool(descriptor);
    expect(tool.type).toBe("function");
    expect(tool.function.parameters.required).toContain("productName");
  });

  it("omits session credentials from public descriptors", () => {
    const artifact = testArtifact(CapabilityStatus.Approved);
    artifact.contract.inputs.push(
      {
        name: "username",
        type: "string",
        required: true,
        description: "login",
      },
      {
        name: "password",
        type: "string",
        required: true,
        description: "login",
        sensitive: true,
      },
    );
    const descriptor = toAgentDescriptor(artifact);
    expect(descriptor.inputs.map((i) => i.name)).toEqual(["productName"]);
  });
});
