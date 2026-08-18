import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { startControlPlaneServer } from "../src/interfaces/http/server.js";
import { HealthResponseSchema, RunListResponseSchema } from "@cu/contracts";
import { resolveRepoRoot } from "../src/infrastructure/paths.js";

describe("API E2E contract", () => {
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

  it("lists runs and fetches a run by id with events", async () => {
    const listRes = await fetch(`${base}/api/runs`);
    expect(listRes.ok).toBe(true);
    expect(listRes.headers.get("x-request-id")).toBeTruthy();
    const listBody = await listRes.json();
    const parsed = RunListResponseSchema.safeParse(listBody);
    expect(parsed.success).toBe(true);
    const first = parsed.data!.items[0];
    if (!first) return;

    const detailRes = await fetch(`${base}/api/runs/${first.runId}`);
    expect(detailRes.ok).toBe(true);
    const detail = (await detailRes.json()) as {
      runId: string;
      events: unknown[];
    };
    expect(detail.runId).toBe(first.runId);

    const eventsRes = await fetch(`${base}/api/runs/${first.runId}/events`);
    expect(eventsRes.ok).toBe(true);
    const eventsBody = (await eventsRes.json()) as { items: unknown[] };
    expect(Array.isArray(eventsBody.items)).toBe(true);

    const evidenceRes = await fetch(`${base}/api/runs/${first.runId}/evidence`);
    expect(evidenceRes.ok).toBe(true);
  });

  it("health contract remains valid", async () => {
    const res = await fetch(`${base}/api/health`);
    const body = await res.json();
    expect(HealthResponseSchema.safeParse(body).success).toBe(true);
  });
});
