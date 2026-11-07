import { Hono } from "hono";
import { parseId } from "../lib/parse-id";
import { readRunDetail, retryJudging, stopRun } from "../services/runs.service";

export const runsRoutes = new Hono();

// GET run
runsRoutes.get("/:id", (c) => {
  const id = parseId(c.req.param("id"), "run");
  return c.json(readRunDetail(id), 200);
});

// POST retry judging
runsRoutes.post("/:id/retry-judging", async (c) => {
  const id = parseId(c.req.param("id"), "run");
  await retryJudging(id);
  return c.json(readRunDetail(id), 202);
});

// STOP run
runsRoutes.post("/:id/stop", (c) => {
  const id = parseId(c.req.param("id"), "run");
  const accepted = stopRun(id);
  return c.json(readRunDetail(id), accepted ? 202 : 200);
});
