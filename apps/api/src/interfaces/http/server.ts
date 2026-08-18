import { createControlPlaneApp } from "./create-app.js";
import { registerDiscoveryRoutes } from "./routes/discovery.routes.js";
import { registerReplayRoutes } from "./routes/replay.routes.js";
import { registerAgentInvokeRoutes } from "./routes/agent-invoke.routes.js";
import type {
  ControlPlaneHandle,
  ControlPlaneOptions,
} from "./types.js";

export type { ControlPlaneHandle, ControlPlaneOptions } from "./types.js";

/**
 * Loopback control-plane API: filesystem catalog + live intervention sessions.
 * Bound to 127.0.0.1. No auth.
 */
export async function startControlPlaneServer(
  options: ControlPlaneOptions = {},
): Promise<ControlPlaneHandle> {
  const port = options.port ?? Number(process.env.OPERATOR_PORT ?? 8787);
  const app = createControlPlaneApp(options, (expressApp) => {
    registerDiscoveryRoutes(expressApp);
    registerReplayRoutes(expressApp);
    registerAgentInvokeRoutes(expressApp);
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const boundPort =
    typeof address === "object" && address ? address.port : port;

  return {
    port: boundPort,
    url: `http://127.0.0.1:${boundPort}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
