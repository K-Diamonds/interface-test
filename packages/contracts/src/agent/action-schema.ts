import { z } from "zod";
import { ActionType, ExtractFrom } from "../capability/enums.js";

/**
 * Accept `controlRef` as an alias of `targetRef` so operator and discovery
 * payloads share one action schema.
 */
function normalizeControlRefs(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  if (
    typeof obj.controlRef === "string" &&
    (obj.targetRef === undefined || obj.targetRef === "")
  ) {
    obj.targetRef = obj.controlRef;
  }
  delete obj.controlRef;
  if (Array.isArray(obj.fields)) {
    obj.fields = obj.fields.map((field) => {
      if (!field || typeof field !== "object") return field;
      const f = { ...(field as Record<string, unknown>) };
      if (
        typeof f.controlRef === "string" &&
        (f.targetRef === undefined || f.targetRef === "")
      ) {
        f.targetRef = f.controlRef;
      }
      delete f.controlRef;
      return f;
    });
  }
  return obj;
}

const AgentActionUnion = z.discriminatedUnion("actionType", [
  z.object({
    actionType: z.literal(ActionType.Navigate),
    url: z.string().url(),
    reasoning: z.string(),
    expectedEffect: z.string(),
  }),
  z.object({
    actionType: z.literal(ActionType.Click),
    targetRef: z.string(),
    reasoning: z.string(),
    expectedEffect: z.string(),
  }),
  z.object({
    actionType: z.literal(ActionType.Type),
    targetRef: z.string(),
    value: z.string(),
    reasoning: z.string(),
    expectedEffect: z.string(),
    sensitive: z.boolean().optional(),
  }),
  z.object({
    actionType: z.literal(ActionType.Read),
    targetRef: z.string(),
    reasoning: z.string(),
    expectedEffect: z.string(),
  }),
  z.object({
    actionType: z.literal(ActionType.Wait),
    waitMs: z.number().int().positive().max(10_000).optional(),
    urlPattern: z.string().optional(),
    text: z.string().optional(),
    reasoning: z.string(),
    expectedEffect: z.string(),
  }),
  z.object({
    actionType: z.literal(ActionType.Extract),
    fields: z.array(
      z.object({
        name: z.string(),
        targetRef: z.string().optional(),
        from: z
          .union([
            z.literal(ExtractFrom.Text),
            z.literal(ExtractFrom.Url),
            z.literal(ExtractFrom.StateHint),
          ])
          .default(ExtractFrom.Text),
      }),
    ),
    reasoning: z.string(),
    expectedEffect: z.string(),
  }),
  z.object({
    actionType: z.literal(ActionType.Complete),
    reasoning: z.string(),
    expectedEffect: z.string(),
    outputs: z.record(z.unknown()).optional(),
  }),
  z.object({
    actionType: z.literal(ActionType.RequestHuman),
    reasoning: z.string(),
    expectedEffect: z.string(),
    reason: z.string(),
  }),
]);

export const AgentActionSchema = z.preprocess(
  normalizeControlRefs,
  AgentActionUnion,
);

export type AgentAction = z.infer<typeof AgentActionUnion>;
