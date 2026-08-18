import { z } from "zod";
import {
  CatalogRunStatus,
  enumValues,
  HealthStatus,
  JobStatus,
} from "../common/enums.js";
import { CapabilityStatus } from "../capability/enums.js";
import { Controller } from "../intervention/enums.js";
import { DiscoveryRunStatus } from "../discovery/enums.js";
import { ExecutionResultStatus } from "../execution/enums.js";

export const RequestIdSchema = z.string().min(1);
export const RunIdSchema = z.string().min(1);
export const CapabilityIdSchema = z.string().min(1);
export const InterventionIdSchema = z.string().min(1);

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorBodySchema>;

/** Indexed run status — execution, discovery, job, health, or catalog fallback. */
export const RunStatusSchema = z.union([
  z.enum(enumValues(ExecutionResultStatus)),
  z.enum(enumValues(DiscoveryRunStatus)),
  z.enum(enumValues(JobStatus)),
  z.enum(enumValues(HealthStatus)),
  z.enum(enumValues(CatalogRunStatus)),
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const ControllerSchema = z.enum(enumValues(Controller));
export const CapabilityStatusSchema = z.enum(enumValues(CapabilityStatus));
