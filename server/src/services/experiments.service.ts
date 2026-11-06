import type {
  CreateExperimentBody,
  Experiment,
  ExperimentUsedBy,
  UpdateExperimentBody,
} from "@promptimize/shared";
import { db } from "../db";
import { experiment_inputs, experiments } from "../db/schemas/experiments";
import { desc, eq, inArray } from "drizzle-orm";
import { NotFoundError } from "../errors/domain";
import { readProject } from "./projects.service";
import { readPrompt } from "./prompts.service";
import { readJudge } from "./judges.service";
import { readInput } from "./inputs.service";

// helper to get linked ids
type ExperimentRow = typeof experiments.$inferSelect;
const EMPTY_USED_BY: ExperimentUsedBy = {
  runs: [],
  optimizeLoops: [],
};

function dbToDomain(
  row: ExperimentRow,
  {
    inputIds = [],
    usedBy = EMPTY_USED_BY,
  }: { inputIds?: number[]; usedBy?: ExperimentUsedBy } = {},
): Experiment {
  return {
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    promptId: row.promptId,
    judgeId: row.judgeId,
    createdAt: row.createdAt,
    inputIds,
    usedBy,
  };
}

function getInputIdsFor(experimentIds: number[]): Map<number, number[]> {
  if (experimentIds.length === 0) return new Map();

  // [{ experiment_id: number, inputId: number},,,] if experimentIds match
  const rows = db
    .select({
      experimentId: experiment_inputs.experimentId,
      inputId: experiment_inputs.inputId,
    })
    .from(experiment_inputs)
    .where(inArray(experiment_inputs.experimentId, experimentIds))
    .all();

  const map = new Map<number, number[]>();
  for (const { experimentId, inputId } of rows) {
    const list = map.get(experimentId);
    if (list) list.push(inputId);
    else map.set(experimentId, [inputId]);
  }
  return map;
}

function getInputIdsMap(id: number): Map<number, number[]> {
  return getInputIdsFor([id]);
}

function assertInProject(
  entity: { projectId: number },
  projectId: number,
  label: string,
  id: number,
): void {
  if (entity.projectId !== projectId) throw new NotFoundError(label, id);
}

// LIST experiments
export function listExperiments(projectId: number): Experiment[] {
  readProject(projectId);
  const rows = db
    .select()
    .from(experiments)
    .where(eq(experiments.projectId, projectId))
    .orderBy(desc(experiments.id))
    .all();

  // MISSING: used by (update this when Runs and Optimize Loops are done)
  const inputIds = getInputIdsFor(rows.map((r) => r.id));
  return rows.map((r) => dbToDomain(r, { inputIds: inputIds.get(r.id) ?? [] }));
}

// CREATE experiment
export function createExperiment(
  projectId: number,
  data: CreateExperimentBody,
): Experiment {
  readProject(projectId);
  assertInProject(
    readPrompt(data.promptId),
    projectId,
    "prompt",
    data.promptId,
  );

  if (data.judgeId !== null) {
    assertInProject(readJudge(data.judgeId), projectId, "judge", data.judgeId);
  }

  // inputIds live in the join table; de-dupe because its composite PK rejects
  // repeated (experiment, input) pairs
  const { inputIds: rawInputIds, ...rest } = data;
  const inputIds = [...new Set(rawInputIds)];

  for (const inputId of inputIds) {
    assertInProject(readInput(inputId), projectId, "input", inputId);
  }

  return db.transaction((tx) => {
    // insert projectId but without inputIds
    const [experiment] = tx
      .insert(experiments)
      .values({ ...rest, projectId })
      .returning()
      .all();

    tx.insert(experiment_inputs)
      .values(
        inputIds.map((inputId) => ({ experimentId: experiment.id, inputId })),
      )
      .run();
    // reconstruct the data to include inputIds and emtpy usedBy as frontend expects
    return dbToDomain(experiment, { inputIds });
  });
}

// READ experiment
export function readExperiment(id: number): Experiment {
  const experiment = db
    .select()
    .from(experiments)
    .where(eq(experiments.id, id))
    .get();

  if (!experiment) {
    throw new NotFoundError("experiment", id);
  }
  // MISSING: used by (update when Runs and Optimize Loops are done)
  const inputIds = getInputIdsMap(experiment.id);
  return dbToDomain(experiment, {
    inputIds: inputIds.get(experiment.id) ?? [],
  });
}

// EDIT experiment
export function editExperiment(
  id: number,
  data: UpdateExperimentBody,
): Experiment {
  const existing = readExperiment(id);
  const { projectId } = existing;

  if (data.promptId !== undefined) {
    assertInProject(
      readPrompt(data.promptId),
      projectId,
      "prompt",
      data.promptId,
    );
  }

  if (data.judgeId !== undefined && data.judgeId !== null) {
    assertInProject(readJudge(data.judgeId), projectId, "judge", data.judgeId);
  }
  // inputIds are stored in the join table, not on the experiments row; de-dupe
  // because the join table's composite PK rejects repeated pairs
  const { inputIds: rawInputIds, ...rest } = data;
  const inputIds = rawInputIds ? [...new Set(rawInputIds)] : undefined;

  if (inputIds) {
    for (const inputId of inputIds) {
      assertInProject(readInput(inputId), projectId, "input", inputId);
    }
  }

  return db.transaction((tx) => {
    // `set({})` would produce `UPDATE ... SET WHERE`, so skip the write when
    // the patch only changes the input links.
    const experiment =
      Object.keys(rest).length > 0
        ? tx
            .update(experiments)
            .set(rest)
            .where(eq(experiments.id, id))
            .returning()
            .all()[0]
        : tx.select().from(experiments).where(eq(experiments.id, id)).get();

    if (!experiment) {
      throw new NotFoundError("experiment", id);
    }

    if (inputIds) {
      tx.delete(experiment_inputs)
        .where(eq(experiment_inputs.experimentId, id))
        .run();
      tx.insert(experiment_inputs)
        .values(inputIds.map((inputId) => ({ experimentId: id, inputId })))
        .run();
    }

    return dbToDomain(experiment, { inputIds: inputIds ?? existing.inputIds });
  });
}

export function deleteExperiment(id: number) {
  readExperiment(id);
  db.delete(experiments).where(eq(experiments.id, id)).run();
}
