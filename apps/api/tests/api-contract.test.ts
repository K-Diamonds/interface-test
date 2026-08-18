import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { startControlPlaneServer } from "../src/interfaces/http/server.js";
import { HealthResponseSchema } from "@cu/contracts";

describe("API contract", () => {
  let close: (() => Promise<void>) | undefined;
  let base = "";

  beforeAll(async () => {
    const handle = await startControlPlaneServer({ port: 0 });
    base = handle.url;
    close = handle.close;
  });

  afterAll(async () => {
    await close?.();
  });

  it("GET /api/health matches contract", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const body = await res.json();
    const parsed = HealthResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.execution.discovery).toBe(true);
    expect(parsed.data?.execution.browserRuntime).toBe("available");
  });

  it("GET /api/capabilities returns items", async () => {
    const res = await fetch(`${base}/api/capabilities`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });
});
