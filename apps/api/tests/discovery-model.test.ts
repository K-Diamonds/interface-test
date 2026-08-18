import { describe, expect, it, vi } from "vitest";
import {
  GeminiDiscoveryModel,
  geminiGenerateContentUrl,
  isRetryableProviderError,
  parseModelJson,
  withProviderRetry,
} from "../src/application/discovery/discovery-model.js";
import { ProviderError, ValidationError } from "../src/core/errors.js";
import type { DiscoveryModelInput } from "../src/application/discovery/discovery-model.js";

const sampleInput: DiscoveryModelInput = {
  goal: "complete the task",
  observationSummary: "page title Login",
  historySummary: "(none)",
  allowedDomains: ["example.test"],
  allowedActions: ["click", "type", "wait", "complete"],
};

describe("discovery model transport", () => {
  it("derives native generateContent URL from OpenAI-compat Gemini base", () => {
    expect(
      geminiGenerateContentUrl(
        "https://generativelanguage.googleapis.com/v1beta/openai/",
        "gemini-flash-latest",
      ),
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    );
  });

  it("parses fenced model JSON", () => {
    expect(parseModelJson('```json\n{"actionType":"wait","waitMs":1}\n```')).toEqual(
      { actionType: "wait", waitMs: 1 },
    );
  });

  it("retries transient 503 then succeeds", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const value = await withProviderRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new ProviderError("high demand", 503);
        return 7;
      },
      { attempts: 5, sleep },
    );
    expect(value).toBe(7);
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry client 404", async () => {
    await expect(
      withProviderRetry(
        async () => {
          throw new ProviderError("missing model", 404);
        },
        { attempts: 5, sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("classifies premature close as retryable", () => {
    expect(
      isRetryableProviderError(
        new Error("Invalid response body: Premature close"),
      ),
    ).toBe(true);
    expect(isRetryableProviderError(new ValidationError("bad json"))).toBe(
      false,
    );
  });

  it("GeminiDiscoveryModel parses native generateContent JSON actions", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      actionType: "wait",
                      waitMs: 500,
                      reasoning: "settle",
                      expectedEffect: "page ready",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const model = new GeminiDiscoveryModel({
      apiKey: "test-key",
      model: "gemini-flash-latest",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryAttempts: 1,
    });
    const action = await model.nextAction(sampleInput);
    expect(action.actionType).toBe("wait");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain(":generateContent");
    expect(url).not.toContain("chat/completions");
    expect(url).not.toContain("test-key");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(init.body)) as {
      generationConfig: { responseMimeType: string };
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("GeminiDiscoveryModel retries HTTP 503 then returns an action", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "high demand", status: "UNAVAILABLE" },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        actionType: "complete",
                        reasoning: "done",
                        expectedEffect: "goal met",
                        outputs: {},
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const model = new GeminiDiscoveryModel({
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep,
      retryAttempts: 4,
    });
    const action = await model.nextAction(sampleInput);
    expect(action.actionType).toBe("complete");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
