import type { Request, Response, NextFunction } from "express";
import { createId } from "@cu/contracts";

export interface RequestContext {
  requestId: string;
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header("x-request-id");
  const requestId =
    incoming && incoming.trim().length > 0 ? incoming.trim() : createId("req");
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

export function getRequestId(req: Request): string {
  return (req as Request & { requestId?: string }).requestId ?? "req_unknown";
}
