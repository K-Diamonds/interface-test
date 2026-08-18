import { z } from "zod";
import { RunSummarySchema } from "./runs.js";

export const EvidenceIndexSchema = z.object({
  items: z.array(RunSummarySchema),
});
export type EvidenceIndex = z.infer<typeof EvidenceIndexSchema>;
