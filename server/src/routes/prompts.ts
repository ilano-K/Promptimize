import { Hono } from "hono";
import { parseId } from "../lib/parse-id";
import {
  deletePrompt,
  getPrompt,
  updatePrompt,
} from "../services/prompts.service";
import { validateJson } from "../lib/validate";
import { updatePromptBody } from "@promptimize/shared";

export const promptsRoutes = new Hono();

// ======== LIBRARY OBJECTS ===========

// GET prompt
promptsRoutes.get("/:id", (c) => {
  const id = parseId(c.req.param("id"), "prompt");
  const prompt = getPrompt(id);
  return c.json(prompt, 200);
});

// EDIT prompt
promptsRoutes.patch("/:id", validateJson(updatePromptBody), (c) => {
  const id = parseId(c.req.param("id"), "prompt");
  const data = c.req.valid("json");
  const prompt = updatePrompt(id, data);
  return c.json(prompt, 200);
});

// DELETE prompt
promptsRoutes.delete("/:id", (c) => {
  const id = parseId(c.req.param("id"), "prompt");
  deletePrompt(id);
  return c.body(null, 204);
});
