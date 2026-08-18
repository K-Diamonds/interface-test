import { z } from "zod";
import { ActionEffect, ActionIdempotency } from "../capability/enums.js";
import { RiskyActionBehavior } from "../execution/enums.js";
import { enumValues } from "../common/enums.js";

export const PolicySummarySchema = z.object({
  capabilityId: z.string(),
  version: z.number().int().positive(),
  allowedDomains: z.array(z.string()),
  maxSteps: z.number().int().positive().optional(),
  riskyActionBehavior: z.enum(enumValues(RiskyActionBehavior)).optional(),
  effectSemantics: z
    .array(
      z.object({
        effect: z.enum(enumValues(ActionEffect)).optional(),
        idempotency: z.enum(enumValues(ActionIdempotency)).optional(),
      }),
    )
    .optional(),
});
export type PolicySummary = z.infer<typeof PolicySummarySchema>;
