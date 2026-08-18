import type { NextFunction, Request, Response } from "express";
import { mapUnknownError, sendApiError } from "../errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const mapped = mapUnknownError(err);
  sendApiError(res, mapped.status, mapped.code, mapped.message, mapped.details);
}
