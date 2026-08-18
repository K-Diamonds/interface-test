import { describe, expect, it } from "vitest";
import { classifyStepFailure } from "../src/core/execution/error-detector.js";
import {
  CheckpointError,
  LocatorError,
  BusinessOutcomeError,
} from "../src/core/errors.js";
import { shouldRetry, DEFAULT_RETRY, withRetry } from "../src/core/execution/retry-policy.js";
import { RecoverableError } from "../src/core/errors.js";

describe("error classification", () => {
  const step = {
    id: "add-product",
    type: "click" as const,
    description: "Add product",
    target: {
      description: "btn",
      primary: { kind: "text" as const, text: "x" },
      fallbacks: [],
    },
  };

  it("classifies locator unresolved", () => {
    const result = classifyStepFailure(
      new LocatorError("missing", "locator_unresolved", { want: 1 }, { count: 0 }),
      step,
    );
    expect(result.category).toBe("locator_unresolved");
    expect(result.recoverable).toBe(false);
  });

  it("classifies checkpoint failures", () => {
    const result = classifyStepFailure(
      new CheckpointError("bad", "a", "b"),
      step,
    );
    expect(result.category).toBe("checkpoint_failed");
    expect(result.expected).toBe("a");
    expect(result.observed).toBe("b");
  });

  it("business outcomes are distinct from failures", () => {
    const err = new BusinessOutcomeError("PRODUCT_NOT_FOUND", "gone");
    expect(err.outcomeCode).toBe("PRODUCT_NOT_FOUND");
    expect(err.name).toBe("BusinessOutcomeError");
  });

  it("retries only recoverable errors within budget", async () => {
    let attempts = 0;
    const value = await withRetry(
      { ...DEFAULT_RETRY, maxAttempts: 3, delayMs: 1 },
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new RecoverableError("detached", "element_detached");
        }
        return "ok";
      },
    );
    expect(value).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry hard failures", () => {
    expect(
      shouldRetry(
        DEFAULT_RETRY,
        1,
        new LocatorError("x", "locator_ambiguous"),
      ),
    ).toBe(false);
  });
});
