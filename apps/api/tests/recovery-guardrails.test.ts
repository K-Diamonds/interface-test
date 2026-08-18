import { describe, expect, it } from "vitest";
import { applyRecoveryRules } from "../src/core/execution/recovery.js";
import { detectExceptionalState } from "../src/core/execution/exceptional-state.js";
import type { CapabilityArtifact, SurfaceObservation } from "@cu/contracts";
import { CapabilityStatus, RecoveryOutcome } from "@cu/contracts";
import type { ComputerSurface } from "../src/core/surface.js";
import type { AutomationPolicy } from "../src/core/policy/policy.js";
import { SessionController } from "../src/core/intervention/session-controller.js";
import { createInterventionRequest } from "../src/core/intervention/intervention.js";
import { ControllerOwnershipError } from "../src/core/errors.js";

function observation(dialogs: SurfaceObservation["dialogs"]): SurfaceObservation {
  return {
    location: "http://127.0.0.1/",
    controls: [],
    visibleText: [],
    dialogs,
    stateHints: {},
    fingerprint: "fp",
  };
}

function artifact(
  targetName: string,
  extras: { effect?: "reversible-mutation"; risk?: "low" } = {
    effect: "reversible-mutation",
    risk: "low",
  },
): CapabilityArtifact {
  return {
    schemaVersion: "1.0",
    capability: {
      id: "session.dismiss-interstitial",
      name: "x",
      description: "x",
      version: 1,
      status: CapabilityStatus.Draft,
    },
    compatibility: {
      appId: "fixture",
      targetPatterns: ["http://127.0.0.1/**"],
    },
    contract: { inputs: [], outputs: [] },
    policy: {
      allowedDomains: ["127.0.0.1"],
      allowedActions: ["click", "navigate"],
      riskyActionPolicy: "require-human",
    },
    steps: [
      {
        id: "go",
        type: "navigate",
        url: "http://127.0.0.1/",
        description: "go",
        effect: "navigation",
        risk: "low",
      },
    ],
    successCondition: { type: "url", pattern: ".*" },
    knownOutcomes: [],
    recoveryRules: [
        {
          id: "dismiss",
          when: "known_interstitial",
          action: "dismiss-dialog",
          maxAttempts: 1,
          effect: extras.effect,
          risk: extras.risk,
          target: {
          description: targetName,
          primary: { kind: "role", role: "button", name: targetName },
          fallbacks: [],
        },
      },
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      discoveredFromRunId: "fixture",
      generatorVersion: "1.0.0",
    },
  };
}

function surface(clicks: string[]): ComputerSurface {
  return {
    observe: async () => observation([]),
    navigate: async () => ({ ok: true, durationMs: 1 }),
    click: async (target) => {
      clicks.push(target.description);
      return { ok: true, durationMs: 1 };
    },
    type: async () => ({ ok: true, durationMs: 1 }),
    read: async () => "",
    count: async () => 0,
    waitFor: async () => undefined,
    screenshot: async () => Buffer.from(""),
    getCurrentLocation: async () => "http://127.0.0.1/",
    close: async () => undefined,
  };
}

const policy: AutomationPolicy = {
  allowedDomains: ["127.0.0.1"],
  allowedActions: ["click", "navigate"],
  riskyActions: [],
  riskyActionBehavior: "require-human",
};

describe("exceptional state and recovery guardrails", () => {
  it("detects a known interstitial only when the artifact declared a rule", () => {
    const obs = observation([
      { ref: "d0", title: "Scheduled maintenance", kind: "modal" },
    ]);
    expect(detectExceptionalState(obs, artifact("Continue to application"))).toMatchObject({
      signal: "known_interstitial",
    });
    const bare = artifact("Continue to application");
    delete bare.recoveryRules;
    expect(detectExceptionalState(obs, bare)).toBeNull();
  });

  it("allows a declared dismiss control after policy check", async () => {
    const clicks: string[] = [];
    const events: string[] = [];
    const outcome = await applyRecoveryRules({
      artifact: artifact("Continue to application"),
      error: new Error("known interstitial"),
      surface: surface(clicks),
      attemptByRule: new Map(),
      policy,
      logger: {
        log: async (type) => {
          events.push(type);
        },
      },
    });
    expect(outcome).toBe(RecoveryOutcome.Retry);
    expect(clicks).toEqual(["Continue to application"]);
    expect(events).toContain("recovery.started");
    expect(events).toContain("policy.allowed");
    expect(events).toContain("recovery.action_executed");
    expect(events).toContain("recovery.completed");
  });

  it("does not bypass policy for a high-risk recovery click", async () => {
    const clicks: string[] = [];
    const outcome = await applyRecoveryRules({
      artifact: artifact("Confirm purchase and checkout", {}),
      error: new Error("known interstitial"),
      surface: surface(clicks),
      attemptByRule: new Map(),
      policy,
    });
    expect(outcome).toBe(RecoveryOutcome.Escalated);
    expect(clicks).toEqual([]);
  });

  it("refuses recovery when automation does not own the session", async () => {
    const session = new SessionController("run_own");
    session.start();
    await session.requestIntervention(
      createInterventionRequest({
        runId: "run_own",
        reason: "human",
        stateSummary: "human control",
      }),
    );
    await expect(
      applyRecoveryRules({
        artifact: artifact("Continue to application"),
        error: new Error("known interstitial"),
        surface: surface([]),
        attemptByRule: new Map(),
        policy,
        session,
      }),
    ).rejects.toBeInstanceOf(ControllerOwnershipError);
  });

  it("blocks a recovery click that is not on the action allowlist", async () => {
    const clicks: string[] = [];
    const events: string[] = [];
    const outcome = await applyRecoveryRules({
      artifact: artifact("Continue to application"),
      error: new Error("known interstitial"),
      surface: surface(clicks),
      attemptByRule: new Map(),
      policy: { ...policy, allowedActions: ["navigate"] },
      logger: {
        log: async (type) => {
          events.push(type);
        },
      },
    });
    expect(outcome).toBe(RecoveryOutcome.Escalated);
    expect(clicks).toEqual([]);
    expect(events).toContain("recovery.action");
  });

  it("stops after maxAttempts instead of looping", async () => {
    const clicks: string[] = [];
    const attempts = new Map<string, number>();
    const events: string[] = [];
    const logger = {
      log: async (type: string) => {
        events.push(type);
      },
    };
    const first = await applyRecoveryRules({
      artifact: artifact("Continue to application"),
      error: new Error("known interstitial"),
      surface: surface(clicks),
      attemptByRule: attempts,
      policy,
      logger,
    });
    expect(first).toBe(RecoveryOutcome.Retry);
    const second = await applyRecoveryRules({
      artifact: artifact("Continue to application"),
      error: new Error("known interstitial"),
      surface: surface(clicks),
      attemptByRule: attempts,
      policy,
      logger,
    });
    expect(second).toBe(RecoveryOutcome.Unhandled);
    expect(clicks).toEqual(["Continue to application"]);
    expect(events).toContain("recovery.exhausted");
  });

  it("escalates dismiss-dialog when no target is declared rather than guessing OK", async () => {
    const art = artifact("Continue to application");
    art.recoveryRules![0] = {
      ...art.recoveryRules![0]!,
      target: undefined,
    };
    const clicks: string[] = [];
    const outcome = await applyRecoveryRules({
      artifact: art,
      error: new Error("known interstitial"),
      surface: surface(clicks),
      attemptByRule: new Map(),
      policy,
    });
    expect(outcome).toBe(RecoveryOutcome.Escalated);
    expect(clicks).toEqual([]);
  });
});
