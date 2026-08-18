import { describe, expect, it } from "vitest";
import { createBrowserbaseSessionFactory } from "../src/infrastructure/browser/browserbase/browserbase-session-factory.js";

const live = Boolean(process.env.BROWSERBASE_API_KEY);

describe.skipIf(!live)("live Browserbase session (opt-in)", () => {
  it("creates, observes, and closes a remote session", async () => {
    const factory = createBrowserbaseSessionFactory();
    const handle = await factory.create({ headless: true });
    try {
      expect(handle.externalSessionId).toBeTruthy();
      await handle.surface.navigate("https://example.com");
      const obs = await handle.surface.observe();
      expect(obs.location).toMatch(/example\.com/);
    } finally {
      await handle.terminate();
    }
  });
});
