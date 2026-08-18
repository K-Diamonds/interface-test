import type {
  BrowserSessionFactory,
  BrowserSessionHandle,
} from "../../src/infrastructure/browser/session-factory.js";
import type { ComputerSurface } from "../../src/core/surface.js";
import type { SurfaceObservation } from "@cu/contracts";

export function mockSurface(): ComputerSurface {
  const observation: SurfaceObservation = {
    location: "https://example.com",
    controls: [],
    visibleText: [],
    dialogs: [],
    stateHints: {},
    fingerprint: "fp",
  };
  return {
    observe: async () => observation,
    navigate: async () => ({ ok: true, durationMs: 1 }),
    click: async () => ({ ok: true, durationMs: 1 }),
    type: async () => ({ ok: true, durationMs: 1 }),
    read: async () => "",
    waitFor: async () => undefined,
    screenshot: async () => Buffer.from("png"),
    getCurrentLocation: async () => "https://example.com",
    count: async () => 0,
    close: async () => undefined,
  };
}

export function mockRemoteSessionFactory(
  sessionId = "bb_sess_test",
): BrowserSessionFactory {
  return {
    async create(): Promise<BrowserSessionHandle> {
      return {
        surface: mockSurface(),
        externalSessionId: sessionId,
        disconnect: async () => undefined,
        terminate: async () => undefined,
      };
    },
    async reconnect(id: string): Promise<BrowserSessionHandle> {
      return {
        surface: mockSurface(),
        externalSessionId: id,
        disconnect: async () => undefined,
        terminate: async () => undefined,
      };
    },
  };
}
