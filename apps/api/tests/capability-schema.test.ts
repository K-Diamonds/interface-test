import { describe, expect, it } from "vitest";
import { CapabilityArtifactSchema } from "@cu/contracts";
import { validateCapability } from "../src/core/capability/validator.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveRepoRoot } from "../src/infrastructure/paths.js";

const seed = JSON.parse(
  readFileSync(
    path.join(resolveRepoRoot(), "artifacts/capabilities/cart.add-product/v1.json"),
    "utf8",
  ),
);

describe("capability schema", () => {
  it("accepts the seeded artifact", () => {
    const parsed = CapabilityArtifactSchema.safeParse(seed);
    expect(parsed.success).toBe(true);
    const result = validateCapability(seed);
    expect(result.ok).toBe(true);
  });

  it("accepts the recoverable-interstitial fixture artifact", () => {
    const recovery = JSON.parse(
      readFileSync(
        path.join(
          resolveRepoRoot(),
          "artifacts/capabilities/session.dismiss-interstitial/v1.json",
        ),
        "utf8",
      ),
    );
    expect(CapabilityArtifactSchema.safeParse(recovery).success).toBe(true);
    expect(validateCapability(recovery).ok).toBe(true);
  });

  it("rejects missing success condition via incomplete object", () => {
    const bad = { ...seed, successCondition: undefined };
    const result = validateCapability(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects unknown input parameter references", () => {
    const bad = structuredClone(seed);
    bad.steps[1].value = { source: "input", name: "notARealInput" };
    const result = validateCapability(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("notARealInput"))).toBe(true);
  });

  it("rejects undeclared extract outputs", () => {
    const bad = structuredClone(seed);
    const extract = bad.steps.find((s: { type: string }) => s.type === "extract");
    extract.outputs.push({ name: "ghost", from: "url" });
    const result = validateCapability(bad);
    expect(result.ok).toBe(false);
  });

  it("detects secrets in artifacts", () => {
    const bad = structuredClone(seed);
    bad.metadata.discoveredFromRunId = "run_with_Bearer sk-abcdefghijklmnopqrstuvwxyz";
    const result = validateCapability(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /secret/i.test(e))).toBe(true);
  });
});
