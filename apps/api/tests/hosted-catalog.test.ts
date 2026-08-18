import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createHostedControlPlaneApp } from "../src/interfaces/http/hosted-app.js";
import { resolveRepoRoot } from "../src/infrastructure/paths.js";
import {
  CapabilityListResponseSchema,
  HealthResponseSchema,
  RunListResponseSchema,
} from "@cu/contracts";

describe("hosted catalog API", () => {
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

  it("serves health and catalog lists", async () => {
    const healthRes = await fetch(`${base}/api/health`);
    expect(healthRes.ok).toBe(true);
    const health = await healthRes.json();
    expect(HealthResponseSchema.safeParse(health).success).toBe(true);
    expect(health.bind).toBe("hosted");
    expect(health.execution.browserRuntimeProvider).toBe("browserbase");
    expect(["unreachable", "not_configured"]).toContain(
      health.components.browserRuntime,
    );
    expect(health.execution.browserRuntime).toBe("unavailable");
    expect(health.execution.browserRuntimeReason).toBe(
      "BROWSERBASE_API_KEY_MISSING",
    );
    expect(health.execution.discovery).toBe(false);
    expect(health.execution.replay).toBe(false);
    expect(health.execution.humanControl).toBe(false);
    expect(JSON.stringify(health)).not.toMatch(/AIza|sk-live|apiKey["']?\s*:/i);

    const capsRes = await fetch(`${base}/api/capabilities`);
    expect(capsRes.ok).toBe(true);
    const caps = await capsRes.json();
    expect(CapabilityListResponseSchema.safeParse(caps).success).toBe(true);
    expect(caps.items.length).toBeGreaterThan(0);

    const runsRes = await fetch(`${base}/api/runs`);
    expect(runsRes.ok).toBe(true);
    expect(RunListResponseSchema.safeParse(await runsRes.json()).success).toBe(
      true,
    );
  });

  it("rejects live discovery on the hosted plane", async () => {
    const res = await fetch(`${base}/api/discovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: "x",
        target: "https://www.saucedemo.com",
      }),
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("LOCAL_RUNTIME_REQUIRED");
  });

  it("rejects live intervention control on the hosted plane", async () => {
    const res = await fetch(`${base}/api/interventions/int_x/take-control`, {
      method: "POST",
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("LOCAL_RUNTIME_REQUIRED");
  });

  it("omits credentials from public capability contracts", async () => {
    const catalog = await fetch(`${base}/api/agent/capabilities`);
    const body = (await catalog.json()) as {
      items: Array<{ inputs: Array<{ name: string }> }>;
    };
    expect(
      body.items.flatMap((item) => item.inputs.map((i) => i.name)),
    ).not.toContain("password");
    expect(
      body.items.flatMap((item) => item.inputs.map((i) => i.name)),
    ).not.toContain("username");

    const artifactRes = await fetch(
      `${base}/api/capabilities/cart.add-product/versions/2`,
    );
    expect(artifactRes.ok).toBe(true);
    const artifact = (await artifactRes.json()) as {
      contract: { inputs: Array<{ name: string }> };
    };
    expect(artifact.contract.inputs.some((i) => i.name === "password")).toBe(
      false,
    );
    expect(artifact.contract.inputs.some((i) => i.name === "username")).toBe(
      false,
    );
  });
});
