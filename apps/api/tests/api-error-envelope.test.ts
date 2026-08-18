import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { startControlPlaneServer } from "../src/interfaces/http/server.js";

describe("API error envelope", () => {
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

  function assertEnvelope(body: unknown, status: number) {
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
          requestId: expect.any(String),
        }),
      }),
    );
    const err = (body as { error: { code: string; message: string } }).error;
    expect(err.code.length).toBeGreaterThan(0);
    expect(err.message.length).toBeGreaterThan(0);
    // Never a bare string error
    expect(typeof (body as { error: unknown }).error).toBe("object");
  }

  it.each([
    ["GET", "/api/runs/does-not-exist"],
    ["GET", "/api/capabilities/missing-id"],
    ["GET", "/api/capabilities/missing-id/versions/99"],
    ["GET", "/api/interventions/missing-id"],
    ["POST", "/api/discovery"],
    ["POST", "/api/replay"],
  ])("%s %s returns structured error envelope", async (method, path) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: method === "POST" ? JSON.stringify({}) : undefined,
    });
    const body = await res.json();
    assertEnvelope(body, res.status);
  });
});
