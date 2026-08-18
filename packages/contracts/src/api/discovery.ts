import { z } from "zod";
import { JobAcceptanceStatus, RunMode } from "../common/enums.js";
import { RunIdSchema } from "./common.js";

export const DiscoveryRequestSchema = z.object({
  goal: z.string().min(1).max(2000),
  target: z.string().url(),
  parameters: z.record(z.unknown()).default({}),
  maxSteps: z.number().int().min(1).max(100).default(25),
  timeoutSeconds: z.number().int().min(10).max(900).default(240),
  policy: z
    .object({
      allowedDomains: z.array(z.string()).min(1),
    })
    .optional(),
  headless: z.boolean().optional(),
  scripted: z.boolean().optional(),
});
export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;

export const DiscoveryAcceptedSchema = z.object({
  runId: RunIdSchema,
  status: z.literal(JobAcceptanceStatus.Accepted),
});
export type DiscoveryAccepted = z.infer<typeof DiscoveryAcceptedSchema>;

export const ReplayRequestSchema = z.object({
  capabilityId: z.string().min(1),
  version: z.number().int().positive().optional(),
  inputs: z.record(z.unknown()).default({}),
  headless: z.boolean().optional(),
  forceIntervention: z.boolean().optional(),
});
export type ReplayRequest = z.infer<typeof ReplayRequestSchema>;

export const ReplayAcceptedSchema = z.object({
  runId: RunIdSchema,
  status: z.literal(JobAcceptanceStatus.Accepted),
  mode: z.literal(RunMode.Replay),
});
export type ReplayAccepted = z.infer<typeof ReplayAcceptedSchema>;
