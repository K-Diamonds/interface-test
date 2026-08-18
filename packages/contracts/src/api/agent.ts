import { z } from "zod";
import { CapabilityIdSchema, CapabilityStatusSchema, RunIdSchema } from "./common.js";
import { PrimitiveType, enumValues } from "../common/enums.js";
import { ExecutionResultStatus } from "../execution/enums.js";

export const AgentContractFieldSchema = z.object({
  name: z.string(),
  type: z.enum(enumValues(PrimitiveType)),
  required: z.boolean().optional(),
  description: z.string().optional(),
});
export type AgentContractField = z.infer<typeof AgentContractFieldSchema>;

export const AgentCapabilityDescriptorSchema = z.object({
  id: CapabilityIdSchema,
  version: z.number().int().positive(),
  name: z.string(),
  description: z.string(),
  status: CapabilityStatusSchema,
  invocable: z.boolean(),
  inputs: z.array(AgentContractFieldSchema),
  outputs: z.array(AgentContractFieldSchema),
});
export type AgentCapabilityDescriptor = z.infer<
  typeof AgentCapabilityDescriptorSchema
>;

export const AgentCapabilityListResponseSchema = z.object({
  items: z.array(AgentCapabilityDescriptorSchema),
});
export type AgentCapabilityListResponse = z.infer<
  typeof AgentCapabilityListResponseSchema
>;

export const AgentInvokeRequestSchema = z.object({
  arguments: z.record(z.unknown()).default({}),
});
export type AgentInvokeRequest = z.infer<typeof AgentInvokeRequestSchema>;

export const AgentInvokeSuccessSchema = z.object({
  status: z.literal(ExecutionResultStatus.Success),
  capability: z.object({
    id: CapabilityIdSchema,
    version: z.number().int().positive(),
  }),
  outputs: z.record(z.unknown()),
  runId: RunIdSchema,
});

export const AgentInvokeBusinessOutcomeSchema = z.object({
  status: z.literal(ExecutionResultStatus.BusinessOutcome),
  capability: z.object({
    id: CapabilityIdSchema,
    version: z.number().int().positive(),
  }),
  outcome: z.object({
    code: z.string(),
    message: z.string(),
  }),
  runId: RunIdSchema,
});

export const AgentInvokeFailureSchema = z.object({
  status: z.literal(ExecutionResultStatus.Failure),
  capability: z.object({
    id: CapabilityIdSchema,
    version: z.number().int().positive(),
  }),
  failure: z.object({
    code: z.string(),
    message: z.string(),
  }),
  runId: RunIdSchema,
});

export const AgentInvokeInterventionSchema = z.object({
  status: z.literal(ExecutionResultStatus.InterventionRequired),
  capability: z.object({
    id: CapabilityIdSchema,
    version: z.number().int().positive(),
  }),
  reason: z.string(),
  runId: RunIdSchema,
  interventionId: z.string().optional(),
  liveViewUrl: z.string().url().optional(),
});

export const AgentInvokeResponseSchema = z.discriminatedUnion("status", [
  AgentInvokeSuccessSchema,
  AgentInvokeBusinessOutcomeSchema,
  AgentInvokeFailureSchema,
  AgentInvokeInterventionSchema,
]);
export type AgentInvokeResponse = z.infer<typeof AgentInvokeResponseSchema>;

export const ApprovalReadinessSchema = z.enum([
  "insufficient_data",
  "candidate",
  "degraded",
]);
export type ApprovalReadiness = z.infer<typeof ApprovalReadinessSchema>;

export const CapabilityReliabilitySchema = z.object({
  capabilityId: CapabilityIdSchema,
  version: z.number().int().positive(),
  sampleSize: z.number().int().nonnegative(),
  successfulRuns: z.number().int().nonnegative(),
  businessOutcomes: z.number().int().nonnegative(),
  hardFailures: z.number().int().nonnegative(),
  interventions: z.number().int().nonnegative(),
  executionReliability: z.number().min(0).max(1).optional(),
  status: z.enum(["insufficient_data", "ok"]),
  approvalReadiness: ApprovalReadinessSchema,
});
export type CapabilityReliability = z.infer<typeof CapabilityReliabilitySchema>;
