import { Hono } from "hono";
import { validateJson } from "../lib/validate";
import {
  createProjectBody,
  createPromptBody,
  updateProjectBody,
} from "@promptimize/shared";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "../services/projects.service";
import { createPrompt, listPrompts } from "../services/prompts.service";
import { parseId } from "../lib/parse-id";

export const projectRoutes = new Hono();

// LIST projects
projectRoutes.get("/", async (c) => {
  const rows = listProjects();
  return c.json(rows);
});

// CREATE a project
projectRoutes.post("/", validateJson(createProjectBody), async (c) => {
  const data = c.req.valid("json");
  const project = createProject(data);
  return c.json(project, 201);
});

// GET a project
projectRoutes.get("/:id", async (c) => {
  const id = parseId(c.req.param("id"), "project");
  const project = getProject(id);
  return c.json(project, 200);
});

// EDIT a project
projectRoutes.patch("/:id", validateJson(updateProjectBody), async (c) => {
  const id = parseId(c.req.param("id"), "project");
  const data = c.req.valid("json");
  const project = updateProject(id, data);
  return c.json(project, 200);
});

// DELETE project
projectRoutes.delete("/:id", async (c) => {
  const id = parseId(c.req.param("id"), "project");
  deleteProject(id);
  return c.body(null, 204);
});

// ======== PROMPTS IN A PROJECT ===========

// LIST prompts
projectRoutes.get("/:id/prompts", async (c) => {
  const id = parseId(c.req.param("id"), "project");
  const rows = listPrompts(id);

  return c.json(rows);
});

// CREATE prompt
projectRoutes.post("/:id/prompts", validateJson(createPromptBody), async (c) => {
  const projectId = parseId(c.req.param("id"), "project");
  const data = c.req.valid("json");
  const prompt = createPrompt(projectId, data);

  return c.json(prompt, 201);
});
