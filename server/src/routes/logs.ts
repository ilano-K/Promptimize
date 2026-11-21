import { Hono } from "hono";
import type { LogFile } from "@promptimize/shared";
import { logPath, readLogFile } from "../lib/log";

export const logsRoutes = new Hono();

logsRoutes.get("/", (c) => {
  const body: LogFile = { path: logPath, text: readLogFile() };
  return c.json(body, 200);
});
