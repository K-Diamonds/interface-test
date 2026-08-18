import { createControlPlaneApp } from "./create-app.js";
import { registerHostedExecutionRoutes } from "./routes/hosted-execution.routes.js";
import type { ControlPlaneOptions } from "./types.js";

/** Vercel / hosted catalog API. Live execution is registered when Browserbase is ready. */
export function createHostedControlPlaneApp(
  options: ControlPlaneOptions = {},
) {
  return createControlPlaneApp({ ...options, hosted: true }, (app) => {
    registerHostedExecutionRoutes(app);
  });
}
