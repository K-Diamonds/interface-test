import { describe, expect, it } from "vitest";
import {
  canTransition,
  assertTransition,
} from "../src/core/intervention/control-state.js";
import { SessionController } from "../src/core/intervention/session-controller.js";
import { createInterventionRequest } from "../src/core/intervention/intervention.js";
import { ControllerOwnershipError } from "../src/core/errors.js";
import type { ComputerSurface } from "../src/core/surface.js";
import type { SurfaceObservation } from "@cu/contracts";

function mockSurface(): ComputerSurface {
  const observation: SurfaceObservation = {
    location: "https://www.saucedemo.com/",
    controls: [],
    visibleText: [],
    dialogs: [],
    stateHints: {},
    fingerprint: "abc",
  };
  return {
    observe: async () => observation,
    navigate: async () => ({ ok: true, durationMs: 1 }),
    click: async () => ({ ok: true, durationMs: 1 }),
    type: async () => ({ ok: true, durationMs: 1 }),
    read: async () => "text",
    waitFor: async () => undefined,
    screenshot: async () => Buffer.from("png"),
    getCurrentLocation: async () => observation.location,
    count: async () => 0,
    close: async () => undefined,
  };
}

describe("session state machine", () => {
  it("allows valid transitions", () => {
    expect(canTransition("created", "running")).toBe(true);
    expect(canTransition("running", "awaiting_human")).toBe(true);
    expect(canTransition("human_control", "resuming")).toBe(true);
    expect(canTransition("completed", "running")).toBe(false);
  });

  it("assertTransition throws on invalid", () => {
    expect(() => assertTransition("completed", "running")).toThrow(/Invalid/);
  });

  it("enforces controller ownership", async () => {
    const session = new SessionController("run_test", mockSurface());
    session.start();
    session.assertController("automation");
    expect(() => session.assertController("human")).toThrow(
      ControllerOwnershipError,
    );

    const intervention = createInterventionRequest({
      runId: "run_test",
      reason: "demo",
      stateSummary: "paused",
    });
    await session.requestIntervention(intervention);
    session.assertController("human");
    expect(() => session.assertController("automation")).toThrow(
      ControllerOwnershipError,
    );

    session.recordHumanAction({ action: "click", target: "Login" });
    expect(session.getHumanActions()).toHaveLength(1);

    session.resume();
    session.assertController("automation");
    expect(session.getState()).toBe("running");
  });
});
