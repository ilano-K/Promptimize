import type {
  CreateExperimentBody,
  Experiment,
  ExperimentUsedBy,
  Judge,
  Prompt,
  UpdateExperimentBody,
} from "@promptimize/shared";
import { db } from "../db";
import { experiment_inputs, experiments } from "../db/schemas/experiments";
import { desc, eq, inArray } from "drizzle-orm";
import {
  DuplicateNameError,
  ModelNotConfiguredError,
  NotFoundError,
  ValidationError,
} from "../errors/domain";
import { readProject } from "./projects.service";
import { createPrompt, readPrompt } from "./prompts.service";
import { createJudge, readJudge } from "./judges.service";
import { readInput } from "./inputs.service";
import { listRuns } from "./runs.service";

// RESTORE prompt object from the experiment's most recent snapshot
export function restorePrompt(experimentId: number): Prompt {
  const experiment = readExperiment(experimentId);
  const snapshot = latestSnapshot(experimentId);
  const prompt = snapshot.prompt;

  const created = createFromSnapshot(
    () =>
      createPrompt(experiment.projectId, {
        ...prompt,
        // snapshots store "no schema" as null; create bodies expect it absent
        outputSchema: prompt.outputSchema ?? undefined,
      }),
    "prompt",
    prompt.name,
    prompt.model,
  );

  editExperiment(experimentId, { promptId: created.id });
  return created;
}

// RESTORE judge object from the experiment's most recent snapshot
export function restoreJudge(experimentId: number): Judge {
  const experiment = readExperiment(experimentId);
  const snapshot = latestSnapshot(experimentId);
  const judge = snapshot.judge;

  // prompt-only runs have no judge, so there is nothing to restore
  if (!judge) {
    throw new ValidationError(
      `The latest run of experiment ${experimentId} has no judge to restore from.`,
    );
  }

  const created = createFromSnapshot(
    () => createJudge(experiment.projectId, judge),
    "judge",
    judge.name,
    judge.model,
  );

  editExperiment(experimentId, { judgeId: created.id });
  return created;
}

// ======================================================
// === Snapshot of the experiment's newest run (if any) =
// ======================================================
function latestSnapshot(experimentId: number) {
  const runs = listRuns(experimentId).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  if (runs.length === 0) {
    throw new ValidationError(
      `Nothing to restore from: experiment ${experimentId} has never run.`,
    );
  }

  return runs[0].snapshot;
}

// CREATE the library object, translating the errors a restore can hit into
// messages the user can act on at the restore button.
function createFromSnapshot<T>(
  create: () => T,
  entity: "prompt" | "judge",
  name: string,
  model: string,
): T {
  try {
    return create();
  } catch (error) {
    if (error instanceof DuplicateNameError) {
      throw new ValidationError(
        `A ${entity} named "${name}" already exists; rename it, then restore again.`,
      );
    }
    if (error instanceof ModelNotConfiguredError) {
      throw new ValidationError(
        `The run's ${entity} used model "${model}", which is no longer configured; add it in Settings, then restore again.`,
      );
    }
    throw error;
  }
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

  // MISSING: used by (fill in when the experiment screen shows run counts)
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
  // MISSING: used by (fill in when the experiment screen shows run counts)
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

// helper to get linked ids
type ExperimentRow = typeof experiments.$inferSelect;
const EMPTY_USED_BY: ExperimentUsedBy = {
  runs: [],
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
