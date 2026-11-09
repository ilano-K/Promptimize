import { Hono } from "hono";
import {
  deleteExperiment,
  editExperiment,
  readExperiment,
  restoreJudge,
  restorePrompt,
} from "../services/experiments.service";
import { parseId } from "../lib/parse-id";
import { validateJson } from "../lib/validate";
import { updateExperimentBody } from "@promptimize/shared";
import {
  executeRun,
  listRuns,
  markRunFailed,
  startRun,
} from "../services/runs.service";
import { queueRun } from "../jobs/runs";

export const experimentsRoutes = new Hono();

// RUN experiment
experimentsRoutes.post("/:id/runs", (c) => {
  const id = parseId(c.req.param("id"), "experiment");
  const run = startRun(id);
  queueRun(run.id, () => executeRun(run.id), markRunFailed);
  return c.json(run, 201);
});

// LIST experiment runs
experimentsRoutes.get("/:id/runs", (c) => {
  const id = parseId(c.req.param("id"), "experiment");
  const runs = listRuns(id);
  return c.json(runs, 200);
});
// GET experiment
experimentsRoutes.get("/:id", (c) => {
  const id = parseId(c.req.param("id"), "experiment");
  const experiment = readExperiment(id);
  return c.json(experiment, 200);
});

// EDIT experiment
experimentsRoutes.patch("/:id", validateJson(updateExperimentBody), (c) => {
  const id = parseId(c.req.param("id"), "experiment");
  const data = c.req.valid("json");
  const experiment = editExperiment(id, data);
  return c.json(experiment, 200);
});

// DELETE experiment
experimentsRoutes.delete("/:id", (c) => {
  const id = parseId(c.req.param("id"), "experiment");
  deleteExperiment(id);
  return c.body(null, 204);
});

// RESTORE prompt object from experiment snapshot
experimentsRoutes.post("/:id/restore-prompt", (c) => {
  const id = parseId(c.req.param("id"), "experiment");
  const prompt = restorePrompt(id);
  return c.json(prompt, 201);
});

// RESTORE judge object from experiment snapshot
experimentsRoutes.post("/:id/restore-judge", (c) => {
  const id = parseId(c.req.param("id"), "experiment");
  const judge = restoreJudge(id);
  return c.json(judge, 201);
});

