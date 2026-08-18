import {
  ReplayAcceptedSchema,
  type ReplayAccepted,
  type ReplayRequest,
} from "@cu/contracts";
import { apiPost } from "./client";

export async function startReplay(body: ReplayRequest): Promise<ReplayAccepted> {
  return apiPost("/api/replay", ReplayAcceptedSchema, body);
}
