import { Hono } from "hono";
import {
  deleteInput,
  readInput,
  updateInput,
} from "../services/inputs.service";
import { validateJson } from "../lib/validate";
import { updateInputBody } from "@promptimize/shared";
import { parseId } from "../lib/parse-id";

export const inputRoutes = new Hono();

inputRoutes.get("/:id", (c) => {
  const id = parseId(c.req.param("id"), "input");
  const input = readInput(id);
  return c.json(input, 200);
});

inputRoutes.patch("/:id", validateJson(updateInputBody), (c) => {
  const id = parseId(c.req.param("id"), "input");
  const data = c.req.valid("json");
  const input = updateInput(id, data);
  return c.json(input, 200);
});

inputRoutes.delete("/:id", (c) => {
  const id = parseId(c.req.param("id"), "input");
  deleteInput(id);
  return c.body(null, 204);
});
