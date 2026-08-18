import { z } from "zod";
import { EvidenceKind, RunMode, enumValues } from "../common/enums.js";
import {
  ControllerSchema,
  RunIdSchema,
  RunStatusSchema,
} from "./common.js";

export const RunSummarySchema = z.object({
  id: RunIdSchema,
  kind: z.enum(enumValues(EvidenceKind)),
  runId: RunIdSchema,
  path: z.string(),
  mtime: z.string(),
  hasResult: z.boolean(),
  hasEvents: z.boolean(),
  hasIntervention: z.boolean(),
  status: RunStatusSchema.optional(),
  capabilityId: z.string().optional(),
  capabilityVersion: z.number().int().positive().optional(),
  mode: z.enum(enumValues(RunMode)).optional(),
  controller: ControllerSchema.optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const RunListResponseSchema = z.object({
  items: z.array(RunSummarySchema),
});
export type RunListResponse = z.infer<typeof RunListResponseSchema>;

export const RunDetailSchema = z.object({
  id: RunIdSchema,
  kind: z.enum(enumValues(EvidenceKind)),
  runId: RunIdSchema,
  path: z.string(),
  files: z.array(z.string()),
  result: z.record(z.unknown()).optional(),
  intervention: z.record(z.unknown()).optional(),
  humanActions: z.array(z.unknown()).optional(),
  events: z.array(z.unknown()),
});
export type RunDetail = z.infer<typeof RunDetailSchema>;

export const RunEventSchema = z.object({
  type: z.string(),
  at: z.string().optional(),
  runId: RunIdSchema.optional(),
  requestId: z.string().optional(),
  data: z.unknown().optional(),
});
export type RunEvent = z.infer<typeof RunEventSchema>;
