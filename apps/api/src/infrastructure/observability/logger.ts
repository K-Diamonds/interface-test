import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Actor, LoggerMode } from "@cu/contracts";
import { redactSecrets, redactValue } from "../../core/policy/redaction.js";
import { inferEvidenceKeyFromPath, mirrorRepoRelativeFile } from "../persistence/remote-mirror.js";

export type LogEvent = {
  timestamp: string;
  runId: string;
  mode: LoggerMode;
  event: string;
  stepId?: string;
  action?: string;
  target?: string;
  durationMs?: number;
  summary?: string;
  actor?: Actor;
  [key: string]: unknown;
};

export class Logger {
  constructor(
    private readonly runId: string,
    private readonly mode: LoggerMode,
    private readonly logPath: string,
  ) {}

  static async create(
    runId: string,
    mode: LoggerMode,
    evidenceDir: string,
  ): Promise<Logger> {
    await mkdir(evidenceDir, { recursive: true });
    const logPath = path.join(evidenceDir, "events.jsonl");
    return new Logger(runId, mode, logPath);
  }

  async log(
    event: string,
    fields: Omit<Partial<LogEvent>, "timestamp" | "runId" | "mode" | "event"> = {},
  ): Promise<void> {
    const entry: LogEvent = {
      timestamp: new Date().toISOString(),
      runId: this.runId,
      mode: this.mode,
      event,
      ...fields,
    };
    const redacted = redactValue(entry) as LogEvent;
    const line = redactSecrets(JSON.stringify(redacted));
    await appendFile(this.logPath, line + "\n", "utf8");
    const key = inferEvidenceKeyFromPath(this.logPath);
    if (key) {
      await mirrorRepoRelativeFile(this.logPath, key).catch(() => undefined);
    }
  }

  get path(): string {
    return this.logPath;
  }
}
