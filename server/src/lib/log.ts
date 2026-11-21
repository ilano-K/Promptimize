import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./app-dirs";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export const logPath = path.join(dataDir, "logs", "promptimize.log");

type Details = Record<string, string | number | boolean | undefined>;

// Provider errors often hide the useful detail in `cause`. Never include
// requestBodyValues or responseHeaders: they can hold prompts and tokens.
export function errorDetails(
  error: unknown,
  cap = 2000,
): Record<string, string | number> {
  const e = error as Error & {
    code?: string | number;
    statusCode?: number;
    cause?: unknown;
  };
  const cut = (value: string) =>
    value.length > cap ? `${value.slice(0, cap)}...` : value;
  const details: Record<string, string | number> = {};
  if (e.name) details.name = cut(e.name);
  if (e.message) details.message = cut(e.message);
  if (typeof e.code === "string" || typeof e.code === "number") {
    details.code = e.code;
  }
  if (typeof e.statusCode === "number") details.statusCode = e.statusCode;
  if (e.cause instanceof Error) {
    details.causeName = cut(e.cause.name);
    details.causeMessage = cut(e.cause.message);
  }
  return details;
}

// Synchronous and quiet on failure: logging must never break a request or a run.
export function log(level: LogLevel, event: string, details?: Details): void {
  try {
    const context = Object.entries(details ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(" ");
    const line = [new Date().toISOString(), level.padEnd(5), event, context]
      .filter(Boolean)
      .join(" ");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${line}\n`);
  } catch {
    // No file, no log. The caller's work continues either way.
  }
}

export function readLogFile(maxLines = 2000): string {
  try {
    const text = fs.readFileSync(logPath, "utf-8");
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "";
  }
}
