import { Hono } from "hono";
import {
  deleteExperiment,
  editExperiment,
  readExperiment,
} from "../services/experiments.service";
import { parseId } from "../lib/parse-id";
import { validateJson } from "../lib/validate";
import { updateExperimentBody } from "@promptimize/shared";

export const experimentsRoutes = new Hono();

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
