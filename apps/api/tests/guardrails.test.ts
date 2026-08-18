import { describe, expect, it } from "vitest";
import {
  checkAction,
  checkNavigation,
  enforceGuardrail,
} from "../src/core/policy/guardrails.js";
import { SAUCEDEMO_AUTOMATION_POLICY } from "../src/profiles/saucedemo/policy.js";
import {
  InterventionRequiredError,
  PolicyViolationError,
} from "../src/core/errors.js";

describe("guardrails", () => {
  it("allows allowlisted domains", () => {
    const d = checkNavigation(
      "https://www.saucedemo.com/inventory.html",
      SAUCEDEMO_AUTOMATION_POLICY,
    );
    expect(d.decision).toBe("allow");
  });

  it("blocks non-allowlisted domains", () => {
    const d = checkNavigation(
      "https://evil.example/phish",
      SAUCEDEMO_AUTOMATION_POLICY,
    );
    expect(d.decision).toBe("block");
  });

  it("rejects prohibited actions", () => {
    const d = checkAction({
      actionType: "navigate",
      policy: {
        ...SAUCEDEMO_AUTOMATION_POLICY,
        allowedActions: ["click"],
      },
      url: "https://www.saucedemo.com/",
    });
    expect(d.decision).toBe("block");
  });

  it("escalates high-impact / declared risky actions", () => {
    const d = checkAction({
      actionType: "click",
      policy: SAUCEDEMO_AUTOMATION_POLICY,
      description: "Confirm purchase and checkout",
      targetName: "Checkout",
      declaredRisk: "risky",
    });
    expect(d.decision).toBe("require-human");
    expect(() => enforceGuardrail(d)).toThrow(InterventionRequiredError);
  });

  it("fail-closes unknown state-changing clicks", () => {
    const d = checkAction({
      actionType: "click",
      policy: SAUCEDEMO_AUTOMATION_POLICY,
      description: "Do something",
      targetName: "Mystery control",
    });
    expect(d.decision).toBe("require-human");
  });

  it("discovery allows unknown in-domain clicks so live LLM exploration can proceed", () => {
    const d = checkAction({
      actionType: "click",
      policy: SAUCEDEMO_AUTOMATION_POLICY,
      description: "Activate the labeled control to progress the goal",
      targetName: "Mystery control",
      discoveryLenient: true,
    });
    expect(d.decision).toBe("allow");
  });

  it("discovery still escalates checkout-class side effects", () => {
    const d = checkAction({
      actionType: "click",
      policy: SAUCEDEMO_AUTOMATION_POLICY,
      description: "Confirm purchase and checkout",
      targetName: "Checkout",
      discoveryLenient: true,
    });
    expect(d.decision).toBe("require-human");
  });

  it("allows known reversible mutations like login", () => {
    const d = checkAction({
      actionType: "click",
      policy: SAUCEDEMO_AUTOMATION_POLICY,
      description: "Click login",
      targetName: "Login",
    });
    expect(d.decision).toBe("allow");
  });

  it("enforce throws on block", () => {
    expect(() =>
      enforceGuardrail({ decision: "block", reason: "nope" }),
    ).toThrow(PolicyViolationError);
  });
});
