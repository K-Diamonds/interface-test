/**
 * Registers a live intervention session on the shared control-plane HTTP app
 * (`/api/interventions/*` in server.ts). Does not start a second server.
 */
import type { SessionController } from "../../core/intervention/session-controller.js";
import type { InterventionRequest } from "../../core/intervention/intervention.js";
import { interventionRegistry } from "../../core/intervention/registry.js";
import { startControlPlaneServer } from "./server.js";
import type { AutomationPolicy } from "../../core/policy/policy-types.js";

export interface LiveInterventionOptions {
  port?: number;
  session: SessionController;
  intervention: InterventionRequest;
  operatorPolicy: AutomationPolicy;
}

export interface LiveInterventionHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

let sharedPlane: Awaited<ReturnType<typeof startControlPlaneServer>> | null =
  null;

export async function registerLiveIntervention(
  options: LiveInterventionOptions,
): Promise<LiveInterventionHandle> {
  interventionRegistry.register({
    session: options.session,
    intervention: options.intervention,
    operatorPolicy: options.operatorPolicy,
  });

  const port = options.port ?? Number(process.env.OPERATOR_PORT ?? 8787);
  const interventionId = options.intervention.id;

  if (!sharedPlane) {
    try {
      sharedPlane = await startControlPlaneServer({ port });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/EADDRINUSE/.test(message)) throw err;
      console.warn(
        `Port ${port} in use — assuming control plane is already running (pnpm serve).`,
      );
    }
  }

  const uiBase =
    process.env.WEB_ORIGIN?.replace(/\/$/, "") ?? "http://127.0.0.1:5173";
  return {
    port,
    url: `${uiBase}/interventions/${encodeURIComponent(interventionId)}`,
    close: async () => {
      interventionRegistry.unregister(interventionId);
    },
  };
}
