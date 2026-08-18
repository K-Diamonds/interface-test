import { describe, expect, it } from "vitest";
import { replayCapability } from "../src/core/execution/replay-engine.js";
import type { CapabilityArtifact } from "@cu/contracts";
import { CapabilityStatus } from "@cu/contracts";
import type { ComputerSurface } from "../src/core/surface.js";
import type { SurfaceObservation, TargetDescriptor } from "@cu/contracts";
import { LocatorError } from "../src/core/errors.js";
import { mkdir, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

function baseArtifact(overrides?: Partial<CapabilityArtifact>): CapabilityArtifact {
  return {
    schemaVersion: "1.0",
    capability: {
      id: "test.cap",
      name: "Test",
      description: "test",
      version: 1,
      status: CapabilityStatus.Draft,
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
    knownOutcomes: [
      {
        code: "PRODUCT_NOT_FOUND",
        message: "No product matched the requested product name.",
        detection: { kind: "missing-target", stepId: "add-product" },
      },
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      discoveredFromRunId: "run_x",
      generatorVersion: "1.0.0",
    },
    ...overrides,
  };
}

function createMockSurface(options: {
  clickImpl?: (t: TargetDescriptor) => Promise<void>;
  location?: string;
}): ComputerSurface {
  let location = options.location ?? "https://www.saucedemo.com/";
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
    click: async (target) => {
      if (options.clickImpl) await options.clickImpl(target);
      location = "https://www.saucedemo.com/cart.html";
      return { ok: true, durationMs: 1, redirectedTo: location };
    },
    type: async () => ({ ok: true, durationMs: 1 }),
    read: async () => "Sauce Labs Backpack",
    waitFor: async () => undefined,
    screenshot: async () => Buffer.from("png"),
    getCurrentLocation: async () => location,
    count: async () => {
      const obs = observation();
      return Number(obs.stateHints.cartCount ?? obs.stateHints.numericBadge ?? 0);
    },
    close: async () => undefined,
  };
}

describe("replay engine", () => {
  it("successful path returns outputs without LLM", async () => {
    const rootDir = path.join(tmpdir(), `cus-replay-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });

    const surface = createMockSurface({});
    const result = await replayCapability(
      baseArtifact(),
      { productName: "Sauce Labs Backpack" },
      { surface, rootDir, evidenceRoot: path.join(rootDir, "evidence"), closeSurface: false },
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.outputs.productName).toBe("Sauce Labs Backpack");
      expect(result.outputs.inCart).toBe(true);
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("returns business_outcome for missing product", async () => {
    const rootDir = path.join(tmpdir(), `cus-biz-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    const surface = createMockSurface({
      clickImpl: async () => {
        throw new LocatorError("No matches", "locator_unresolved", {}, { count: 0 });
      },
    });

    const result = await replayCapability(
      baseArtifact(),
      { productName: "DOES NOT EXIST" },
      { surface, rootDir, evidenceRoot: path.join(rootDir, "evidence"), closeSurface: false },
    );

    expect(result.status).toBe("business_outcome");
    if (result.status === "business_outcome") {
      expect(result.outcome.code).toBe("PRODUCT_NOT_FOUND");
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("returns structured failure on checkpoint error", async () => {
    const rootDir = path.join(tmpdir(), `cus-fail-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    const surface = createMockSurface({
      location: "https://www.saucedemo.com/inventory.html",
    });
    // click does not navigate to cart — success condition fails
    surface.click = async () => ({ ok: true, durationMs: 1 });

    const result = await replayCapability(
      baseArtifact(),
      { productName: "Sauce Labs Backpack" },
      { surface, rootDir, evidenceRoot: path.join(rootDir, "evidence"), closeSurface: false },
    );

    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.failure.category).toMatch(/checkpoint|hard_failure|unexpected/);
      expect(result.failure.message.length).toBeGreaterThan(0);
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("requests intervention for risky step when enabled path returns intervention", async () => {
    const rootDir = path.join(tmpdir(), `cus-int-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    const surface = createMockSurface({});
    const artifact = baseArtifact({
      steps: [
        {
          id: "risky",
          type: "click",
          description: "Confirm purchase checkout",
          risk: "risky",
          target: {
            description: "Checkout",
            primary: { kind: "text", text: "Checkout" },
            fallbacks: [],
          },
        },
      ],
      successCondition: { type: "url", pattern: ".*" },
      knownOutcomes: [],
    });

    const result = await replayCapability(
      artifact,
      { productName: "x" },
      { surface, rootDir, evidenceRoot: path.join(rootDir, "evidence"), enableOperator: false, closeSurface: false },
    );

    expect(result.status).toBe("intervention_required");
    await rm(rootDir, { recursive: true, force: true });
  });

  it("retries recoverable conditions", async () => {
    const rootDir = path.join(tmpdir(), `cus-retry-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    let attempts = 0;
    const surface = createMockSurface({
      clickImpl: async () => {
        attempts += 1;
        if (attempts < 2) {
          const { RecoverableError } = await import("../src/core/errors.js");
          throw new RecoverableError("detached", "element_detached");
        }
      },
    });

    const artifact = baseArtifact();
    const add = artifact.steps.find((s) => s.id === "add-product");
    if (add && add.type === "click") {
      add.retry = {
        maxAttempts: 3,
        delayMs: 1,
        retryOn: ["element_detached"],
      };
    }

    const result = await replayCapability(
      artifact,
      { productName: "Sauce Labs Backpack" },
      { surface, rootDir, evidenceRoot: path.join(rootDir, "evidence"), closeSurface: false },
    );
    expect(result.status).toBe("success");
    expect(attempts).toBe(2);
    await rm(rootDir, { recursive: true, force: true });
  });

  it("recovers a known interstitial then completes without an LLM", async () => {
    const rootDir = path.join(tmpdir(), `cus-interstitial-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    let dismissed = false;
    const clicks: string[] = [];
    const surface = createMockSurface({});
    surface.observe = async () => ({
      location: "http://127.0.0.1/recoverable-interstitial.html",
      title: "Session notice",
      controls: [],
      visibleText: dismissed ? ["Task complete"] : ["Scheduled maintenance"],
      dialogs: dismissed
        ? []
        : [{ ref: "d0", title: "Scheduled maintenance", kind: "modal" }],
      stateHints: {},
      fingerprint: dismissed ? "after" : "before",
    });
    surface.click = async (target) => {
      clicks.push(target.description);
      if (/continue/i.test(target.description)) dismissed = true;
      return { ok: true, durationMs: 1 };
    };
    surface.getCurrentLocation = async () =>
      "http://127.0.0.1/recoverable-interstitial.html";

    const interstitial = baseArtifact({
      contract: {
        inputs: [
          {
            name: "productName",
            type: "string",
            required: true,
            description: "unused",
          },
        ],
        outputs: [],
      },
      policy: {
        allowedDomains: ["127.0.0.1"],
        allowedActions: ["navigate", "click", "checkpoint"],
        riskyActionPolicy: "require-human",
      },
      compatibility: {
        appId: "fixture",
        targetPatterns: ["http://127.0.0.1/**"],
      },
      steps: [
        {
          id: "complete",
          type: "click",
          description: "Complete task",
          effect: "reversible-mutation",
          risk: "low",
          target: {
            description: "Complete task",
            primary: { kind: "role", role: "button", name: "Complete task" },
            fallbacks: [],
          },
        },
      ],
      successCondition: { type: "url", pattern: ".*" },
      knownOutcomes: [],
      recoveryRules: [
        {
          id: "dismiss-session-notice",
          when: "known_interstitial",
          action: "dismiss-dialog",
          maxAttempts: 1,
          effect: "reversible-mutation",
          risk: "low",
          target: {
            description: "Continue to application",
            primary: {
              kind: "role",
              role: "button",
              name: "Continue to application",
            },
            fallbacks: [],
          },
        },
      ],
    });

    const result = await replayCapability(
      interstitial,
      { productName: "x" },
      {
        surface,
        rootDir,
        evidenceRoot: path.join(rootDir, "evidence"),
        closeSurface: false,
      },
    );
    expect(result.status).toBe("success");
    expect(clicks[0]).toMatch(/Continue/);
    expect(clicks).toContain("Complete task");
    await rm(rootDir, { recursive: true, force: true });
  });

  it("emits target.fallback_resolved when a fallback locator is used", async () => {
    const rootDir = path.join(tmpdir(), `cus-fallback-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    const surface = createMockSurface({});
    surface.click = async () => ({
      ok: true,
      durationMs: 1,
      usedFallback: true,
      primaryStrategy: "role",
      resolvedStrategy: "text",
      driftSignals: ["fallback-locator-used", "primary-locator-failure"],
    });

    const result = await replayCapability(
      baseArtifact({
        successCondition: { type: "url", pattern: ".*" },
      }),
      { productName: "Sauce Labs Backpack" },
      {
        surface,
        rootDir,
        evidenceRoot: path.join(rootDir, "evidence"),
        closeSurface: false,
      },
    );
    expect(result.status).toBe("success");
    const events = await readFile(
      path.join(rootDir, "evidence", "replay", result.runId, "events.jsonl"),
      "utf8",
    );
    expect(events).toMatch(/target\.fallback_resolved/);
    expect(events).toMatch(/fallback-locator-used/);
    await rm(rootDir, { recursive: true, force: true });
  });

  it("resumed intervention uses normal output extraction", async () => {
    const rootDir = path.join(tmpdir(), `cus-resume-out-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    let clicks = 0;
    const surface = createMockSurface({
      clickImpl: async () => {
        clicks += 1;
        if (clicks === 1) {
          throw new Error("captcha interstitial");
        }
      },
    });
    const artifact = baseArtifact({
      steps: [
        {
          id: "add-product",
          type: "click",
          description: "Add product to cart",
          effect: "reversible-mutation",
          risk: "low",
          onError: "escalate",
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
    });

    const result = await replayCapability(
      artifact,
      { productName: "Sauce Labs Backpack" },
      {
        surface,
        rootDir,
        evidenceRoot: path.join(rootDir, "evidence"),
        closeSurface: false,
        enableOperator: true,
        openOperator: async ({ session }) => {
          session.resume();
          return { url: "http://127.0.0.1:0", close: async () => undefined };
        },
      },
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.outputs).toEqual({
        productName: "Sauce Labs Backpack",
        cartCount: 1,
        inCart: true,
      });
    }
    expect(clicks).toBe(2);
    await rm(rootDir, { recursive: true, force: true });
  });

  it("abort during intervention is a failure with code ABORTED", async () => {
    const rootDir = path.join(tmpdir(), `cus-abort-${Date.now()}`);
    await mkdir(rootDir, { recursive: true });
    const surface = createMockSurface({
      clickImpl: async () => {
        throw new Error("stuck");
      },
    });
    const artifact = baseArtifact({
      steps: [
        {
          id: "add-product",
          type: "click",
          description: "Add product",
          onError: "escalate",
          target: {
            description: "Add",
            primary: { kind: "text", text: "Add" },
            fallbacks: [],
          },
        },
      ],
    });

    const result = await replayCapability(
      artifact,
      { productName: "x" },
      {
        surface,
        rootDir,
        evidenceRoot: path.join(rootDir, "evidence"),
        closeSurface: false,
        enableOperator: true,
        openOperator: async ({ session }) => {
          session.abort("operator abort");
          return { url: "http://127.0.0.1:0", close: async () => undefined };
        },
      },
    );

    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.failure.code).toBe("ABORTED");
    }
    await rm(rootDir, { recursive: true, force: true });
  });
});
