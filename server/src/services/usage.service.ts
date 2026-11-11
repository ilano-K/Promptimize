import { eq } from "drizzle-orm";
import type { ModelUsage, Usage, UsageRef } from "@promptimize/shared";
import { db } from "../db";
import { experiment_inputs, experiments, judges, prompts } from "../db/schemas";

// "Used by" is a query on the references, never a stored column: deleting an
// experiment must make the warning disappear without touching the object.

export function experimentsUsingPrompt(promptId: number): UsageRef[] {
  return db
    .select({
      id: experiments.id,
      name: experiments.name,
      projectId: experiments.projectId,
    })
    .from(experiments)
    .where(eq(experiments.promptId, promptId))
    .orderBy(experiments.id)
    .all();
}

export function experimentsUsingJudge(judgeId: number): UsageRef[] {
  return db
    .select({
      id: experiments.id,
      name: experiments.name,
      projectId: experiments.projectId,
    })
    .from(experiments)
    .where(eq(experiments.judgeId, judgeId))
    .orderBy(experiments.id)
    .all();
}

// Inputs are referenced through the join table, so the experiment itself has
// no column to match on.
export function experimentsUsingInput(inputId: number): UsageRef[] {
  return db
    .select({
      id: experiments.id,
      name: experiments.name,
      projectId: experiments.projectId,
    })
    .from(experiment_inputs)
    .innerJoin(experiments, eq(experiment_inputs.experimentId, experiments.id))
    .where(eq(experiment_inputs.inputId, inputId))
    .orderBy(experiments.id)
    .all();
}

/**
 * Which prompts and judges point at each configured model id.
 *
 * Settings is global and models are not foreign keys, so the answer has to be
 * computed from the library rather than looked up. One row per configured
 * model would mean a query per model, so group the two tables in one pass.
 */
export function modelUsage(): Usage {
  const models: Record<string, ModelUsage> = {};

  const add = (model: string, key: keyof ModelUsage, ref: UsageRef) => {
    const entry = (models[model] ??= { prompts: [], judges: [] });
    entry[key].push(ref);
  };

  for (const row of db
    .select({
      id: prompts.id,
      name: prompts.name,
      projectId: prompts.projectId,
      model: prompts.model,
    })
    .from(prompts)
    .all()) {
    add(row.model, "prompts", { id: row.id, name: row.name, projectId: row.projectId });
  }

  for (const row of db
    .select({
      id: judges.id,
      name: judges.name,
      projectId: judges.projectId,
      model: judges.model,
    })
    .from(judges)
    .all()) {
    add(row.model, "judges", { id: row.id, name: row.name, projectId: row.projectId });
  }

  return { models };
}
