import { z } from "zod";
import { BindingNodeType } from "./common/enums.js";
import { ValueSource } from "./capability/enums.js";

/** Serializable binding schemas only — runtime resolution lives in API core. */

export const ValueBindingSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal(BindingNodeType.Literal),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  z.object({
    source: z.literal(ValueSource.Input),
    input: z.string().min(1),
  }),
]);
export type ValueBinding = z.infer<typeof ValueBindingSchema>;

export const TextPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(BindingNodeType.Text), value: z.string() }),
  z.object({ type: z.literal(BindingNodeType.Input), input: z.string().min(1) }),
]);

export const TextBindingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(BindingNodeType.Literal), value: z.string() }),
  z.object({
    type: z.literal(BindingNodeType.Template),
    parts: z.array(TextPartSchema).min(1),
  }),
]);
export type TextBinding = z.infer<typeof TextBindingSchema>;
