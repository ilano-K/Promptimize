import { Hono } from "hono";
import type { Health } from "@promptimize/shared";
import { errorHandler } from "./errors";

export const app = new Hono();

app.onError(errorHandler);
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    },
    404,
  );
});

app.get("/api/health", (c) => c.json<Health>({ ok: true }));
