import { Hono } from "hono";
import { deleteJudge, getJudge, updateJudge } from "../services/judges.service";
import { parseId } from "../lib/parse-id";
import { validateJson } from "../lib/validate";
import { updateJudgeBody } from "@promptimize/shared";

export const judgesRoutes = new Hono();

// GET judge
judgesRoutes.get("/:id", (c) => {
  const id = parseId(c.req.param("id"), "judge");
  const judge = getJudge(id);
  return c.json(judge, 200);
});

// EDIT judge
judgesRoutes.patch("/:id", validateJson(updateJudgeBody), (c) => {
  const id = parseId(c.req.param("id"), "judge");
  const data = c.req.valid("json");
  const judge = updateJudge(id, data);
  return c.json(judge, 200);
});

// DELETE judge
judgesRoutes.delete("/:id", (c) => {
  const id = parseId(c.req.param("id"), "judge");
  deleteJudge(id);
  return c.body(null, 204);
});
