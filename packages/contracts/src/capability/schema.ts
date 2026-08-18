import { z } from "zod";
import { enumValues, PrimitiveType } from "../common/enums.js";
import {
  ActionEffect,
  ActionIdempotency,
  ActionType,
  BackoffStrategy,
  BusinessOutcomeDetectionKind,
  CapabilityStatus,
  CheckpointOp,
  CheckpointType,
  ConfirmationPolicy,
  DeclaredRisk,
  ExtractFrom,
  LocatorKind,
  RecoveryAction,
  RelativeRelationship,
  SchemaVersion,
  StepErrorPolicy,
  ValueSource,
  WaitConditionType,
} from "./enums.js";
import { RecoverableErrorCode, RiskyActionBehavior } from "../execution/enums.js";

const AtomicLocatorStrategySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(LocatorKind.Role),
    role: z.string(),
    name: z.string().optional(),
    exact: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal(LocatorKind.Label),
    text: z.string(),
  }),
  z.object({
    kind: z.literal(LocatorKind.Text),
    text: z.string(),
    exact: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal(LocatorKind.Placeholder),
    text: z.string(),
  }),
  z.object({
    kind: z.literal(LocatorKind.TestId),
    testId: z.string(),
  }),
  z.object({
    kind: z.literal(LocatorKind.Css),
    selector: z.string(),
  }),
  z.object({
    kind: z.literal(LocatorKind.Xpath),
    selector: z.string(),
  }),
  z.object({
    kind: z.literal(LocatorKind.Accessibility),
    role: z.string(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal(LocatorKind.Vision),
    description: z.string(),
  }),
]);

export const NestedLocatorRefSchema = z.object({
  primary: AtomicLocatorStrategySchema,
  fallbacks: z.array(AtomicLocatorStrategySchema).default([]),
});

export const RelativeLocatorStrategySchema = z.object({
  kind: z.literal(LocatorKind.Relative),
  relationship: z.enum(enumValues(RelativeRelationship)),
  anchor: NestedLocatorRefSchema,
  target: NestedLocatorRefSchema,
});

export const LocatorStrategySchema = z.union([
  AtomicLocatorStrategySchema,
  RelativeLocatorStrategySchema,
]);

export const ElementFingerprintSchema = z.object({
  role: z.string().optional(),
  text: z.string().optional(),
  tag: z.string().optional(),
  nearbyText: z.array(z.string()).optional(),
  inputType: z.string().optional(),
});
export type ElementFingerprint = z.infer<typeof ElementFingerprintSchema>;

export const TargetDescriptorSchema = z.object({
  description: z.string(),
  primary: LocatorStrategySchema,
  fallbacks: z.array(LocatorStrategySchema).default([]),
  expected: ElementFingerprintSchema.optional(),
  ref: z.string().optional(),
});

export type TargetDescriptor = z.infer<typeof TargetDescriptorSchema>;

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(5),
  delayMs: z.number().int().min(0).max(10_000),
  backoff: z.enum(enumValues(BackoffStrategy)).optional(),
  retryOn: z.array(z.enum(enumValues(RecoverableErrorCode))),
});

export type Checkpoint =
  | { type: typeof CheckpointType.ElementVisible; target: TargetDescriptor }
  | {
      type: typeof CheckpointType.ElementText;
      target: TargetDescriptor;
      expected: string;
    }
  | { type: typeof CheckpointType.Url; pattern: string }
  | {
      type: typeof CheckpointType.Value;
      target: TargetDescriptor;
      expected: string;
    }
  | {
      type: typeof CheckpointType.Count;
      target: TargetDescriptor;
      expected: number;
    }
  | {
      type: typeof CheckpointType.Composite;
      op: CheckpointOp;
      checks: Checkpoint[];
    };

export const CheckpointSchema: z.ZodType<Checkpoint> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal(CheckpointType.ElementVisible),
      target: TargetDescriptorSchema,
    }),
    z.object({
      type: z.literal(CheckpointType.ElementText),
      target: TargetDescriptorSchema,
      expected: z.string(),
    }),
    z.object({
      type: z.literal(CheckpointType.Url),
      pattern: z.string(),
    }),
    z.object({
      type: z.literal(CheckpointType.Value),
      target: TargetDescriptorSchema,
      expected: z.string(),
    }),
    z.object({
      type: z.literal(CheckpointType.Count),
      target: TargetDescriptorSchema,
      expected: z.number().int().nonnegative(),
    }),
    z.object({
      type: z.literal(CheckpointType.Composite),
      op: z.enum(enumValues(CheckpointOp)),
      checks: z.array(CheckpointSchema),
    }),
  ]),
) as z.ZodType<Checkpoint>;

export const CapabilityInputDefinitionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(enumValues(PrimitiveType)),
  required: z.boolean(),
  description: z.string(),
  sensitive: z.boolean().optional(),
});

export const CapabilityOutputDefinitionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(enumValues(PrimitiveType)),
  description: z.string(),
});

export const ActionTypeSchema = z.enum(enumValues(ActionType));

export const KnownBusinessOutcomeSchema = z.object({
  code: z.string(),
  message: z.string(),
  detection: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal(BusinessOutcomeDetectionKind.TextIncludes),
      text: z.string(),
    }),
    z.object({
      kind: z.literal(BusinessOutcomeDetectionKind.UrlPattern),
      pattern: z.string(),
    }),
    z.object({
      kind: z.literal(BusinessOutcomeDetectionKind.MissingTarget),
      stepId: z.string(),
    }),
    z.object({
      kind: z.literal(BusinessOutcomeDetectionKind.CheckpointFail),
      stepId: z.string().optional(),
    }),
  ]),
});

export const RecoveryRuleSchema = z.object({
  id: z.string(),
  when: z.enum(enumValues(RecoverableErrorCode)),
  action: z.enum(enumValues(RecoveryAction)),
  maxAttempts: z.number().int().min(1).max(3).default(2),
  /** Required for wait recovery — no infrastructure magic defaults. */
  delayMs: z.number().int().min(0).max(30_000).optional(),
  /** Required for dismiss-dialog — must declare the allowed control target. */
  target: TargetDescriptorSchema.optional(),
  /** Same effect/risk declaration as a step — recovery is not a policy bypass. */
  effect: z.enum(enumValues(ActionEffect)).optional(),
  risk: z.enum(enumValues(DeclaredRisk)).optional(),
});

export const CapabilityOverlaySchema = z.object({
  locatorOverrides: z
    .record(
      z.object({
        primary: LocatorStrategySchema.optional(),
        fallbacks: z.array(LocatorStrategySchema).optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  routeOverrides: z.array(z.string()).optional(),
  targetAliases: z.record(z.string()).optional(),
});
export type CapabilityOverlay = z.infer<typeof CapabilityOverlaySchema>;

const StepBaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  timeoutMs: z.number().int().positive().optional(),
  retry: RetryPolicySchema.optional(),
  checkpoint: CheckpointSchema.optional(),
  onError: z.enum(enumValues(StepErrorPolicy)).optional(),
  /** Present on artifacts that declared risk before effect was required. */
  risk: z.enum(enumValues(DeclaredRisk)).optional(),
  effect: z.enum(enumValues(ActionEffect)).optional(),
  idempotency: z.enum(enumValues(ActionIdempotency)).optional(),
  confirmation: z.enum(enumValues(ConfirmationPolicy)).optional(),
});

export const CapabilityStepSchema = z.discriminatedUnion("type", [
  StepBaseSchema.extend({
    type: z.literal(ActionType.Navigate),
    url: z.string(),
  }),
  StepBaseSchema.extend({
    type: z.literal(ActionType.Click),
    target: TargetDescriptorSchema,
  }),
  StepBaseSchema.extend({
    type: z.literal(ActionType.Type),
    target: TargetDescriptorSchema,
    value: z.union([
      z.string(),
      z.object({ source: z.literal(ValueSource.Input), name: z.string() }),
      z.object({ source: z.literal(ValueSource.Env), name: z.string() }),
    ]),
  }),
  StepBaseSchema.extend({
    type: z.literal(ActionType.Select),
    target: TargetDescriptorSchema,
    value: z.union([
      z.string(),
      z.object({ source: z.literal(ValueSource.Input), name: z.string() }),
    ]),
  }),
  StepBaseSchema.extend({
    type: z.literal(ActionType.Read),
    target: TargetDescriptorSchema,
    outputName: z.string().optional(),
  }),
  StepBaseSchema.extend({
    type: z.literal(ActionType.Extract),
    outputs: z.array(
      z.object({
        name: z.string(),
        from: z.enum(enumValues(ExtractFrom)),
        target: TargetDescriptorSchema.optional(),
        stateHintKey: z.string().optional(),
        inputKey: z.string().optional(),
        transform: z.enum(enumValues(PrimitiveType)).optional(),
      }),
    ),
  }),
  StepBaseSchema.extend({
    type: z.literal(ActionType.Wait),
    condition: z.discriminatedUnion("type", [
      z.object({ type: z.literal(WaitConditionType.Url), pattern: z.string() }),
      z.object({ type: z.literal(WaitConditionType.Text), text: z.string() }),
      z.object({
        type: z.literal(WaitConditionType.Element),
        target: TargetDescriptorSchema,
      }),
      z.object({
        type: z.literal(WaitConditionType.Timeout),
        ms: z.number().int().positive(),
      }),
    ]),
  }),
  StepBaseSchema.extend({
    type: z.literal(ActionType.Checkpoint),
    check: CheckpointSchema,
  }),
]);

export const CapabilityArtifactSchema = z.object({
  schemaVersion: z.literal(SchemaVersion.V1),
  capability: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    version: z.number().int().positive(),
    status: z.enum(enumValues(CapabilityStatus)),
  }),
  compatibility: z.object({
    appId: z.string(),
    appFamily: z.string().optional(),
    appVersion: z.string().optional(),
    appVersionRange: z.string().optional(),
    tenant: z.string().optional(),
    targetPatterns: z.array(z.string()).min(1),
    versionOverrides: z
      .record(CapabilityOverlaySchema)
      .optional(),
    tenantOverrides: z.record(CapabilityOverlaySchema).optional(),
  }),
  contract: z.object({
    inputs: z.array(CapabilityInputDefinitionSchema),
    outputs: z.array(CapabilityOutputDefinitionSchema),
  }),
  policy: z.object({
    allowedDomains: z.array(z.string()).min(1),
    allowedRoutes: z.array(z.string()).optional(),
    allowedActions: z.array(ActionTypeSchema).min(1),
    riskyActionPolicy: z.enum(enumValues(RiskyActionBehavior)),
  }),
  steps: z.array(CapabilityStepSchema).min(1),
  successCondition: CheckpointSchema,
  knownOutcomes: z.array(KnownBusinessOutcomeSchema).default([]),
  recoveryRules: z.array(RecoveryRuleSchema).optional(),
  metadata: z.object({
    createdAt: z.string(),
    discoveredFromRunId: z.string(),
    generatorVersion: z.string(),
  }),
});

export type CapabilityArtifact = z.infer<typeof CapabilityArtifactSchema>;
export type CapabilityStep = z.infer<typeof CapabilityStepSchema>;
export type CapabilityInputDefinition = z.infer<
  typeof CapabilityInputDefinitionSchema
>;
export type CapabilityOutputDefinition = z.infer<
  typeof CapabilityOutputDefinitionSchema
>;
export type KnownBusinessOutcome = z.infer<typeof KnownBusinessOutcomeSchema>;
export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;
export type NestedLocatorRef = z.infer<typeof NestedLocatorRefSchema>;
export type RelativeLocatorStrategy = z.infer<typeof RelativeLocatorStrategySchema>;
export type RecoveryRule = z.infer<typeof RecoveryRuleSchema>;
