import { describe, expect, it } from "vitest";
import { resolveCapabilityVariant } from "../src/core/domain/capability-variant.js";
import type { CapabilityArtifact } from "@cu/contracts";
import { CapabilityStatus } from "@cu/contracts";

function artifact(): CapabilityArtifact {
  return {
    schemaVersion: "1.0",
    capability: {
      id: "batch.post",
      name: "Post",
      description: "post",
      version: 1,
      status: CapabilityStatus.Approved,
    },
    compatibility: {
      appId: "ledger",
      appFamily: "ledger",
      targetPatterns: ["https://ledger.example/**"],
      versionOverrides: {
        "2024.2": {
          locatorOverrides: {
            submit: {
              primary: { kind: "role", role: "button", name: "Post batch" },
            },
          },
        },
      },
      tenantOverrides: {
        "tenant-a": {
          locatorOverrides: {
            submit: {
              primary: { kind: "role", role: "button", name: "Tenant Post" },
            },
          },
        },
      },
    },
    contract: { inputs: [], outputs: [] },
    policy: {
      allowedDomains: ["ledger.example"],
      allowedActions: ["click"],
      riskyActionPolicy: "require-human",
    },
    steps: [
      {
        id: "submit",
        type: "click",
        description: "submit",
        effect: "reversible-mutation",
        risk: "low",
        target: {
          description: "Submit",
          primary: { kind: "role", role: "button", name: "Submit" },
          fallbacks: [],
        },
      },
    ],
    successCondition: { type: "url", pattern: ".*" },
    knownOutcomes: [],
    metadata: {
      createdAt: new Date().toISOString(),
      discoveredFromRunId: "run_x",
      generatorVersion: "1.0.0",
    },
  };
}

describe("capability variant resolver", () => {
  it("uses the base target with no override", () => {
    const resolved = resolveCapabilityVariant({ capability: artifact() });
    const step = resolved.steps[0];
    expect(step && "target" in step && step.target.primary).toEqual({
      kind: "role",
      role: "button",
      name: "Submit",
    });
  });

  it("applies application-version overlay over base", () => {
    const resolved = resolveCapabilityVariant({
      capability: artifact(),
      appVersion: "2024.2",
    });
    const step = resolved.steps[0];
    expect(step && "target" in step && step.target.primary).toMatchObject({
      name: "Post batch",
    });
  });

  it("gives tenant overlay precedence over version overlay", () => {
    const resolved = resolveCapabilityVariant({
      capability: artifact(),
      appVersion: "2024.2",
      tenantId: "tenant-a",
    });
    const step = resolved.steps[0];
    expect(step && "target" in step && step.target.primary).toMatchObject({
      name: "Tenant Post",
    });
  });

  it("unrelated tenant keeps version/base behavior", () => {
    const resolved = resolveCapabilityVariant({
      capability: artifact(),
      appVersion: "2024.2",
      tenantId: "tenant-other",
    });
    const step = resolved.steps[0];
    expect(step && "target" in step && step.target.primary).toMatchObject({
      name: "Post batch",
    });
  });

  it("rejects overlays that cannot produce a valid artifact", () => {
    const bad = artifact();
    bad.compatibility.tenantOverrides = {
      "tenant-a": {
        locatorOverrides: {
          submit: { primary: { kind: "role" } as never },
        },
      },
    };
    expect(() =>
      resolveCapabilityVariant({ capability: bad, tenantId: "tenant-a" }),
    ).toThrow(/Invalid overlay/i);
  });
});
