import { Hono } from "hono";
import { validateJson } from "../lib/validate";
import {
  createInputBody,
  createJudgeBody,
  createProjectBody,
  createPromptBody,
  createExperimentBody,
  updateProjectBody,
} from "@promptimize/shared";
import {
  createProject,
  deleteProject,
  readProject,
  listProjects,
  editProject,
} from "../services/projects.service";
import { createPrompt, listPrompts } from "../services/prompts.service";
import { parseId } from "../lib/parse-id";
import { createInput, listInputs } from "../services/inputs.service";
import { createJudge, listJudges } from "../services/judges.service";
import {
  createExperiment,
  listExperiments,
} from "../services/experiments.service";

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
  const project = readProject(id);
  return c.json(project, 200);
});

// EDIT a project
projectRoutes.patch("/:id", validateJson(updateProjectBody), async (c) => {
  const id = parseId(c.req.param("id"), "project");
  const data = c.req.valid("json");
  const project = editProject(id, data);
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
projectRoutes.post(
  "/:id/prompts",
  validateJson(createPromptBody),
  async (c) => {
    const projectId = parseId(c.req.param("id"), "project");
    const data = c.req.valid("json");
    const prompt = createPrompt(projectId, data);

    return c.json(prompt, 201);
  },
);

// ======== INPUTS IN A PROJECT ===========

// LIST inputs
projectRoutes.get("/:id/inputs", (c) => {
  const projectId = parseId(c.req.param("id"), "project");
  const rows = listInputs(projectId);
  return c.json(rows, 200);
});

// CREATE inputs
projectRoutes.post("/:id/inputs", validateJson(createInputBody), (c) => {
  const projectId = parseId(c.req.param("id"), "project");
  const data = c.req.valid("json");
  const inputResource = createInput(projectId, data);
  return c.json(inputResource, 201);
});

// ======== JUDGES IN A PROJECT ===========

// LIST judges
projectRoutes.get("/:id/judges", (c) => {
  const projectId = parseId(c.req.param("id"), "project");
  const rows = listJudges(projectId);
  return c.json(rows, 200);
});

// CREATE judge
projectRoutes.post("/:id/judges", validateJson(createJudgeBody), (c) => {
  const projectId = parseId(c.req.param("id"), "project");
  const data = c.req.valid("json");
  const judge = createJudge(projectId, data);
  return c.json(judge, 201);
});

// ======== EXPERIMENTS IN A PROJECT ===========

// LIST experiments
projectRoutes.get("/:id/experiments", (c) => {
  const projectId = parseId(c.req.param("id"), "project");
  const rows = listExperiments(projectId);
  return c.json(rows, 200);
});

// CREATE experiment
projectRoutes.post(
  "/:id/experiments",
  validateJson(createExperimentBody),
  (c) => {
    const projectId = parseId(c.req.param("id"), "project");
    const data = c.req.valid("json");
    const experiment = createExperiment(projectId, data);
    return c.json(experiment, 201);
  },
);
