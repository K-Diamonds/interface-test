import { describe, expect, it } from "vitest";
import { ConservativeGoalVerifier } from "../src/application/discovery/goal-verifier.js";
import { SauceDemoProfile } from "../src/profiles/saucedemo/profile.js";
import {
  createOutputSchema,
  validateOutputContract,
} from "../src/core/execution/output-extractor.js";
import type { CapabilityArtifact } from "@cu/contracts";

describe("goal completion verification", () => {
  const sauceVerifier = SauceDemoProfile.createGoalVerifier!(
    SauceDemoProfile.discoveryContract({
      goal: "Add Sauce Labs Backpack to the cart and reach the cart page",
      parameters: { productName: "Sauce Labs Backpack" },
      startUrl: "https://www.saucedemo.com",
    }),
  );

  it("SauceDemo verifier rejects completion when not on cart page", () => {
    const result = sauceVerifier.verify({
      goal: "Add Sauce Labs Backpack to the cart and reach the cart page",
      observation: {
        location: "https://www.saucedemo.com/inventory.html",
        controls: [],
        visibleText: ["Sauce Labs Backpack"],
        dialogs: [],
        stateHints: {},
        fingerprint: "x",
      },
      parameters: { productName: "Sauce Labs Backpack" },
    });
    expect(result.ok).toBe(false);
  });

  it("SauceDemo verifier accepts cart URL and product text", () => {
    const result = sauceVerifier.verify({
      goal: "Add Sauce Labs Backpack to the cart and reach the cart page",
      observation: {
        location: "https://www.saucedemo.com/cart.html",
        controls: [],
        visibleText: ["Sauce Labs Backpack", "QTY"],
        dialogs: [],
        stateHints: {},
        fingerprint: "y",
      },
      parameters: { productName: "Sauce Labs Backpack" },
    });
    expect(result.ok).toBe(true);
  });

  it("generic verifier rejects completion without explicit success criterion", () => {
    const result = ConservativeGoalVerifier.verify({
      goal: "Do something useful in the app",
      observation: {
        location: "https://example.com/page",
        controls: [{ ref: "1", candidateLocators: [] }],
        visibleText: ["Hello"],
        dialogs: [],
        stateHints: {},
        fingerprint: "z",
      },
    });
    expect(result.ok).toBe(false);
  });
});

describe("output contract validation", () => {
  const artifact = {
    contract: {
      outputs: [
        { name: "productName", type: "string", description: "p" },
        { name: "cartCount", type: "number", description: "c" },
        { name: "inCart", type: "boolean", description: "i" },
      ],
    },
  } as CapabilityArtifact;

  it("rejects Boolean-coercion traps", () => {
    const schema = createOutputSchema(artifact.contract.outputs);
    expect(schema.safeParse({ productName: "x", cartCount: 1, inCart: "false" }).success).toBe(
      false,
    );
  });

  it("accepts strictly typed outputs", () => {
    const result = validateOutputContract(artifact, {
      productName: "Sauce Labs Backpack",
      cartCount: 1,
      inCart: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing outputs", () => {
    const result = validateOutputContract(artifact, { productName: "x" });
    expect(result.ok).toBe(false);
  });
});
