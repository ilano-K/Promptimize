import { Hono } from "hono";
import type { Health } from "@promptimize/shared";
import { NotFoundError } from "./errors/domain";
import { errorHandler } from "./errors/handler";
import {
  projectRoutes,
  promptsRoutes,
  settingsRoutes,
  inputRoutes,
  judgesRoutes,
  experimentsRoutes,
  runsRoutes,
  compareRoutes,
} from "./routes";

export const app = new Hono();

app.onError(errorHandler);
app.notFound(() => {
  throw new NotFoundError("route");
});

const prefix = "/api/v1";

app.route(`${prefix}/projects`, projectRoutes);
app.route(`${prefix}/settings`, settingsRoutes);
app.route(`${prefix}/prompts`, promptsRoutes);
app.route(`${prefix}/inputs`, inputRoutes);
app.route(`${prefix}/judges`, judgesRoutes);
app.route(`${prefix}/experiments`, experimentsRoutes);
app.route(`${prefix}/runs`, runsRoutes);
app.route(`${prefix}/compare`, compareRoutes);

app.get("/api/health", (c) => c.json<Health>({ ok: true }));
