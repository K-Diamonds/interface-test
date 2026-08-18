import type { SessionController } from "./session-controller.js";
import type { InterventionRequest } from "./intervention.js";
import type { AutomationPolicy } from "../policy/policy-types.js";

export interface LiveSessionRegistration {
  runId: string;
  interventionId: string;
  session: SessionController;
  intervention: InterventionRequest;
  /** Operator actions are evaluated against this policy (from capability/profile). */
  operatorPolicy: AutomationPolicy;
  registeredAt: string;
}

/**
 * In-process registry of live intervention sessions.
 * Control-plane API and operator/discovery CLIs share this singleton.
 */
class InterventionRegistryImpl {
  private live = new Map<string, LiveSessionRegistration>();

  register(input: {
    session: SessionController;
    intervention: InterventionRequest;
    operatorPolicy: AutomationPolicy;
  }): LiveSessionRegistration {
    const entry: LiveSessionRegistration = {
      runId: input.session.runId,
      interventionId: input.intervention.id,
      session: input.session,
      intervention: input.intervention,
      operatorPolicy: input.operatorPolicy,
      registeredAt: new Date().toISOString(),
    };
    this.live.set(entry.interventionId, entry);
    this.live.set(entry.runId, entry);
    return entry;
  }

  unregister(idOrRunId: string): void {
    const entry = this.live.get(idOrRunId);
    if (!entry) return;
    this.live.delete(entry.interventionId);
    this.live.delete(entry.runId);
  }

  get(idOrRunId: string): LiveSessionRegistration | undefined {
    return this.live.get(idOrRunId);
  }

  list(): LiveSessionRegistration[] {
    const seen = new Set<string>();
    const out: LiveSessionRegistration[] = [];
    for (const entry of this.live.values()) {
      if (seen.has(entry.interventionId)) continue;
      seen.add(entry.interventionId);
      out.push(entry);
    }
    return out;
  }
}

export const interventionRegistry = new InterventionRegistryImpl();
