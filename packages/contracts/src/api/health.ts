import { z } from "zod";
import {
  ComponentHealth,
  HealthProviderId,
  HealthStatus,
  enumValues,
} from "../common/enums.js";

export const ComponentStatusSchema = z.enum(enumValues(ComponentHealth));
export type ComponentStatus = z.infer<typeof ComponentStatusSchema>;

export const ExecutionRuntimeStateSchema = z.enum(["available", "unavailable"]);
export type ExecutionRuntimeState = z.infer<typeof ExecutionRuntimeStateSchema>;

export const ExecutionCapabilitySchema = z.object({
  browserRuntime: ExecutionRuntimeStateSchema,
  discovery: z.boolean(),
  replay: z.boolean(),
  humanControl: z.boolean(),
  browserRuntimeProvider: z.enum(["local", "browserbase"]).optional(),
  browserRuntimeReason: z.string().optional(),
  readiness: z
    .object({
      browserReady: z.boolean(),
      persistenceReady: z.boolean(),
      modelReady: z.boolean(),
    })
    .default({
      browserReady: false,
      persistenceReady: false,
      modelReady: false,
    }),
});
export type ExecutionCapability = z.infer<typeof ExecutionCapabilitySchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(enumValues(HealthStatus)),
  components: z.object({
    capabilityStore: ComponentStatusSchema,
    evidenceStore: ComponentStatusSchema,
    browserRuntime: ComponentStatusSchema,
    model: ComponentStatusSchema,
    browserProvider: z.enum(["local", "browserbase"]).optional(),
    browserRuntimeReason: z.string().optional(),
  }),
  execution: ExecutionCapabilitySchema,
  provider: z
    .object({
      id: z.enum(enumValues(HealthProviderId)),
      model: z.string().optional(),
      configured: z.boolean(),
    })
    .optional(),
  liveInterventions: z.number().int().nonnegative(),
  bind: z.string().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
