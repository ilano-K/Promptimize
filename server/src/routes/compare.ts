import { Hono } from "hono";
import { parseId } from "../lib/parse-id";
import { compare } from "../services/compare.service";

export const compareRoutes = new Hono();

compareRoutes.get("/", (c) => {
  const runA = c.req.query("runA");
  const runB = c.req.query("runB");

  const runAId = parseId(runA, "run");
  const runBId = parseId(runB, "run");

  return c.json(compare(runAId, runBId), 200);
});
