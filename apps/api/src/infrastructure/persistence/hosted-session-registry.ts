import {
  Controller,
  type ReplayExecutionContext,
  SessionExecutionState,
} from "@cu/contracts";
import type { DiscoveryResumeContext } from "../../application/discover-capability.js";
import { getObjectStore } from "./object-store.js";

export type HostedExecutionState =
  | SessionExecutionState
  | "expired"
  | "aborted";

export interface HostedSessionRecord {
  runId: string;
  externalSessionId: string;
  controller: Controller;
  executionState: HostedExecutionState;
  capabilityId?: string;
  capabilityVersion?: number;
  currentStepId?: string;
  interventionId?: string;
  inputs?: Record<string, unknown>;
  mode?: "discovery" | "replay";
  discovery?: DiscoveryResumeContext;
  executionContext?: ReplayExecutionContext;
  allowDraft?: boolean;
  goal?: string;
  target?: string;
  updatedAt: string;
}

export interface HostedSessionRegistry {
  get(runId: string): Promise<HostedSessionRecord | undefined>;
  getByInterventionId(
    interventionId: string,
  ): Promise<HostedSessionRecord | undefined>;
  put(record: HostedSessionRecord): Promise<void>;
  delete(runId: string): Promise<void>;
}

const PREFIX = "hosted/sessions/";

function keyFor(runId: string): string {
  return `${PREFIX}${runId}.json`;
}

export function createHostedSessionRegistry(): HostedSessionRegistry {
  return {
    async get(runId) {
      const store = getObjectStore();
      if (!store) return undefined;
      const buf = await store.get(keyFor(runId));
      if (!buf) return undefined;
      return JSON.parse(buf.toString("utf8")) as HostedSessionRecord;
    },
    async getByInterventionId(interventionId) {
      const store = getObjectStore();
      if (!store) return undefined;
      const keys = await store.list(PREFIX);
      for (const key of keys) {
        const buf = await store.get(key);
        if (!buf) continue;
        const record = JSON.parse(buf.toString("utf8")) as HostedSessionRecord;
        if (record.interventionId === interventionId) return record;
      }
      return undefined;
    },
    async put(record) {
      const store = getObjectStore();
      if (!store) {
        throw new Error("Hosted session registry requires object storage");
      }
      const next: HostedSessionRecord = {
        ...record,
        updatedAt: new Date().toISOString(),
      };
      await store.put(keyFor(record.runId), JSON.stringify(next));
    },
    async delete(runId) {
      const store = getObjectStore();
      await store?.delete?.(keyFor(runId));
    },
  };
}
