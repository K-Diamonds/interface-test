import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  abortIntervention,
  resumeIntervention,
  takeControl,
} from "@/services/api/interventions";

describe("intervention API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts take-control / resume / abort to ownership endpoints", async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method });
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: true,
              controller: String(input).includes("resume")
                ? "automation"
                : "human",
            }),
        } as Response;
      }),
    );

    await takeControl("int_1");
    await resumeIntervention("int_1");
    await abortIntervention("int_1");

    expect(calls.map((c) => c.url)).toEqual([
      "/api/interventions/int_1/take-control",
      "/api/interventions/int_1/resume",
      "/api/interventions/int_1/abort",
    ]);
    expect(calls.every((c) => c.method === "POST")).toBe(true);
  });
});
