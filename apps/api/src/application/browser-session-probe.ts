import { HttpError } from "../core/errors.js";
import { createRuntimeSessionFactory } from "../infrastructure/runtime.js";

/**
 * One-shot hosted Browserbase session check. Does not return connect URLs.
 */
export async function runHostedBrowserSessionProbe(): Promise<{
  ok: true;
  provider: "browserbase";
}> {
  const factory = await createRuntimeSessionFactory();
  const handle = await factory.create({
    headless: true,
    runId: "probe_browserbase",
  });
  try {
    await handle.surface.navigate("https://www.saucedemo.com/");
    const location = await handle.surface.getCurrentLocation();
    if (!/saucedemo\.com/i.test(location)) {
      throw new HttpError(
        502,
        "BROWSERBASE_READINESS_FAILED",
        "Browserbase session did not reach the probe URL",
      );
    }
    return { ok: true, provider: "browserbase" };
  } finally {
    await handle.terminate().catch(() => undefined);
  }
}
