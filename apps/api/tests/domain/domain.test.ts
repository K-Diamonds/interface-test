import { describe, expect, it } from "vitest";
import { ActionIdempotency, ActionType } from "@cu/contracts";
import { bindTemplate, bindLocatorStrategy, bindTarget } from "../../src/core/domain/parameter-binding.js";
import {
  mayAutoRetry,
  classifyIdempotency,
} from "../../src/core/domain/idempotency.js";
import { evaluateCheckpoint } from "../../src/core/domain/checkpoint-engine.js";
import { UnverifiedGoalVerifier } from "../../src/core/domain/application-profile.js";

describe("parameter binding", () => {
  it("substitutes {{input}} templates", () => {
    expect(bindTemplate("Hello {{name}}", { name: "World" })).toBe(
      "Hello World",
    );
  });

  it("binds templates in locator strategies and targets", () => {
    const bound = bindLocatorStrategy(
      { kind: "role", role: "button", name: "Add {{productName}} to cart" },
      { productName: "Sauce Labs Backpack" },
    );
    expect(bound).toEqual({
      kind: "role",
      role: "button",
      name: "Add Sauce Labs Backpack to cart",
    });

    const target = bindTarget(
      {
        description: "Add {{productName}}",
        primary: {
          kind: "xpath",
          selector: "//div[text()='{{productName}}']",
        },
        fallbacks: [{ kind: "text", text: "{{productName}}" }],
      },
      { productName: "Bike Light" },
    );
    expect(target.description).toBe("Add Bike Light");
    expect(target.primary).toEqual({
      kind: "xpath",
      selector: "//div[text()='Bike Light']",
    });
    expect(target.fallbacks[0]).toEqual({ kind: "text", text: "Bike Light" });
  });

  it("binds templates inside relative locators", () => {
    const bound = bindLocatorStrategy(
      {
        kind: "relative",
        relationship: "same-container",
        anchor: {
          primary: { kind: "text", text: "{{productName}}", exact: true },
          fallbacks: [],
        },
        target: {
          primary: { kind: "role", role: "button", name: "Add to cart" },
          fallbacks: [],
        },
      },
      { productName: "Bike Light" },
    );
    expect(bound).toMatchObject({
      kind: "relative",
      relationship: "same-container",
      anchor: { primary: { kind: "text", text: "Bike Light", exact: true } },
    });
  });

  it("throws on missing parameters", () => {
    expect(() => bindTemplate("{{missing}}", {})).toThrow(/Missing parameter/);
  });
});

describe("idempotency", () => {
  it("blocks auto-retry for irreversible mutations", () => {
    expect(
      mayAutoRetry(
        classifyIdempotency({
          actionType: ActionType.Click,
          declared: ActionIdempotency.Irreversible,
        }),
      ),
    ).toBe(false);
  });

  it("allows auto-retry for read-only", () => {
    expect(
      mayAutoRetry(
        classifyIdempotency({
          actionType: ActionType.Read,
        }),
      ),
    ).toBe(true);
  });
});

describe("checkpoint engine", () => {
  it("url pattern match", async () => {
    const result = await evaluateCheckpoint(
      {
        observe: async () => ({
          location: "https://example.com/cart.html",
          controls: [],
          visibleText: [],
          dialogs: [],
          stateHints: {},
          fingerprint: "x",
        }),
        navigate: async () => ({ ok: true, durationMs: 1 }),
        click: async () => ({ ok: true, durationMs: 1 }),
        type: async () => ({ ok: true, durationMs: 1 }),
        read: async () => "",
        count: async () => 0,
        waitFor: async () => undefined,
        screenshot: async () => Buffer.from(""),
        getCurrentLocation: async () => "https://example.com/cart.html",
        close: async () => undefined,
      },
      { type: "url", pattern: "cart\\.html" },
      {},
    );
    expect(result.satisfied).toBe(true);
  });
});

describe("goal verifier fallback", () => {
  it("generic verifier returns unverified", () => {
    const r = UnverifiedGoalVerifier.verify({
      goal: "anything",
      observation: {
        location: "https://example.com",
        controls: [],
        visibleText: [],
        dialogs: [],
        stateHints: {},
        fingerprint: "x",
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unverified");
  });
});
