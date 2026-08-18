import { z } from "zod";
import {
  InterventionListResponseSchema,
  InterventionObservationSchema,
  InterventionSummarySchema,
  type HumanActionRequest,
  type InterventionObservation,
} from "@cu/contracts";
import { apiGet, apiPost, apiUrl } from "./client";

export type LiveIntervention = z.infer<typeof InterventionSummarySchema>;

export async function fetchInterventions(): Promise<{
  live: LiveIntervention[];
  persisted: LiveIntervention[];
}> {
  return apiGet("/api/interventions", InterventionListResponseSchema);
}

export async function fetchIntervention(
  id: string,
): Promise<LiveIntervention> {
  return apiGet(
    `/api/interventions/${encodeURIComponent(id)}`,
    InterventionSummarySchema,
  );
}

export async function fetchInterventionObservation(
  id: string,
): Promise<InterventionObservation> {
  return apiGet(
    `/api/interventions/${encodeURIComponent(id)}/observation`,
    InterventionObservationSchema,
  );
}

const MutationOkSchema = z.object({ ok: z.boolean() }).passthrough();

export async function takeControl(id: string): Promise<unknown> {
  return apiPost(
    `/api/interventions/${encodeURIComponent(id)}/take-control`,
    MutationOkSchema,
  );
}

export async function resumeIntervention(id: string): Promise<unknown> {
  return apiPost(
    `/api/interventions/${encodeURIComponent(id)}/resume`,
    MutationOkSchema,
  );
}

export async function abortIntervention(id: string): Promise<unknown> {
  return apiPost(
    `/api/interventions/${encodeURIComponent(id)}/abort`,
    MutationOkSchema,
  );
}

export async function postHumanAction(
  id: string,
  payload: HumanActionRequest,
): Promise<unknown> {
  return apiPost(
    `/api/interventions/${encodeURIComponent(id)}/actions`,
    MutationOkSchema,
    payload,
  );
}

export function interventionScreenshotUrl(id: string): string {
  return apiUrl(
    `/api/interventions/${encodeURIComponent(id)}/screenshot?t=${Date.now()}`,
  );
}
