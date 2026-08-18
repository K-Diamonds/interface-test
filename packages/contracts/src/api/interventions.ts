import { z } from "zod";
import { DialogKind } from "../capability/enums.js";
import { EvidenceKind, enumValues } from "../common/enums.js";
import {
  OperatorAction,
  SessionExecutionState,
} from "../intervention/enums.js";
import {
  ControllerSchema,
  InterventionIdSchema,
  RunIdSchema,
} from "./common.js";

export const InterventionSummarySchema = z.object({
  id: InterventionIdSchema,
  runId: RunIdSchema,
  live: z.boolean(),
  state: z.enum(enumValues(SessionExecutionState)).optional(),
  controller: ControllerSchema.optional(),
  intervention: z.record(z.unknown()),
  humanActions: z.array(z.unknown()),
  registeredAt: z.string().optional(),
  kind: z.enum(enumValues(EvidenceKind)).optional(),
  liveViewUrl: z.string().url().optional(),
});
export type InterventionSummary = z.infer<typeof InterventionSummarySchema>;

export const InterventionListResponseSchema = z.object({
  live: z.array(InterventionSummarySchema),
  persisted: z.array(InterventionSummarySchema),
});
export type InterventionListResponse = z.infer<
  typeof InterventionListResponseSchema
>;

export const ObservedControlSummarySchema = z.object({
  ref: z.string(),
  role: z.string().optional(),
  accessibleName: z.string().optional(),
  text: z.string().optional(),
  disabled: z.boolean().optional(),
});
export type ObservedControlSummary = z.infer<typeof ObservedControlSummarySchema>;

export const InterventionObservationSchema = z.object({
  location: z.string(),
  title: z.string().optional(),
  controls: z.array(ObservedControlSummarySchema),
  dialogs: z.array(
    z.object({
      kind: z.enum(enumValues(DialogKind)).optional(),
      title: z.string().optional(),
      text: z.string().optional(),
    }),
  ),
  fingerprint: z.string(),
});
export type InterventionObservation = z.infer<
  typeof InterventionObservationSchema
>;

/** Operator actions target an observed controlRef. Free-text locators are rejected. */
export const HumanActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal(OperatorAction.Click),
    controlRef: z.string().min(1),
  }),
  z.object({
    action: z.literal(OperatorAction.Type),
    controlRef: z.string().min(1),
    value: z.string(),
    sensitive: z.boolean().optional(),
  }),
  z.object({
    action: z.literal(OperatorAction.Navigate),
    url: z.string().url(),
  }),
  z.object({
    action: z.literal(OperatorAction.Wait),
    waitMs: z.number().int().positive().max(30_000).default(500),
  }),
]);
export type HumanActionRequest = z.infer<typeof HumanActionRequestSchema>;
