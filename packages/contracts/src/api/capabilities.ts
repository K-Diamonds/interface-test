import { z } from "zod";
import { CapabilityIdSchema, CapabilityStatusSchema } from "./common.js";

export const CapabilitySummarySchema = z.object({
  id: CapabilityIdSchema,
  versions: z.array(z.number().int().positive()),
  latestVersion: z.number().int().positive(),
  name: z.string().optional(),
  status: CapabilityStatusSchema.optional(),
  description: z.string().optional(),
});
export type CapabilitySummary = z.infer<typeof CapabilitySummarySchema>;

export const CapabilityListResponseSchema = z.object({
  items: z.array(CapabilitySummarySchema),
});
export type CapabilityListResponse = z.infer<typeof CapabilityListResponseSchema>;
