import { Hono } from "hono";
import type { Health } from "@promptimize/shared";
import { NotFoundError } from "./errors/domain";
import { errorHandler } from "./errors/handler";
import { projectRoutes, promptsRoutes, settingsRoutes } from "./routes";

export const app = new Hono();

app.onError(errorHandler);
app.notFound(() => {
  throw new NotFoundError("route");
});

app.route("/api/v1/projects", projectRoutes);
app.route("/api/v1/settings", settingsRoutes);
app.route("/api/v1/prompts", promptsRoutes);

app.get("/api/health", (c) => c.json<Health>({ ok: true }));
