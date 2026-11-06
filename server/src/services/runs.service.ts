import type { Run, RunDetail, RunState } from "@promptimize/shared";
import { readExperiment } from "./experiments.service";
import { readPrompt } from "./prompts.service";
import { NotFoundError, ValidationError } from "../errors/domain";
import { readJudge } from "./judges.service";
import { buildSnapshot } from "../lib/snapshot";
import { readInput } from "./inputs.service";
import { getConfig } from "../config";
import { db } from "../db";
import { results, runs } from "../db/schemas";
import { eq, inArray } from "drizzle-orm";
import { runPrompt } from "../llm/generate";
import { listResults, saveResult } from "./results.service";
import { judgeOutputs, type JudgeOutcome } from "../llm/judge";

export function readRun(runId: number): Run {
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) {
    throw new NotFoundError("run", runId);
  }
  return run;
}

export function readRunDetail(runId: number): RunDetail {
  const run = readRun(runId);
  const results = listResults(runId);

  let outputDoneCount = 0;
  let judgedCount = 0;
  let judgeErrorCount = 0;
  for (const result of results) {
    if (result.status === "output_done") {
      outputDoneCount++;
    } else if (result.status === "judge_error") {
      judgeErrorCount++;
    } else if (result.status === "judged") {
      judgedCount++;
    }
  }

  const progress = {
    total: run.snapshot.inputs.length,
    outputDone: outputDoneCount,
    judged: judgedCount,
    judgeError: judgeErrorCount,
  };

  return { ...run, results, progress };
}

export function startRun(experimentId: number): Run {
  const experiment = readExperiment(experimentId);

  // validate prompt, judge, input exists
  if (experiment.promptId === null) {
    throw new ValidationError(
      `The prompt for experiment ${experimentId} was deleted; pick another before running.`,
    );
  }

  if (experiment.inputIds.length === 0) {
    throw new ValidationError(
      `Experiment ${experimentId} has no inputs; add at least one before running.`,
    );
  }

  const judge =
    experiment.judgeId === null ? null : readJudge(experiment.judgeId);

  const prompt = readPrompt(experiment.promptId);

  const inputs = experiment.inputIds.map(readInput);

  const snapshot = buildSnapshot({
    prompt,
    judge,
    inputs,
    providers: getConfig().providers,
    now: new Date(),
  });

  // insert and return run
  const [run] = db
    .insert(runs)
    .values({ experimentId, snapshot, startedAt: snapshot.createdAt })
    .returning()
    .all();

  return run;
}

function setStatus(runId: number, status: RunState): void {
  db.update(runs).set({ status }).where(eq(runs.id, runId)).run();
}

export async function executeRun(runId: number): Promise<void> {
  const pendingOutputs: { resultId: number; output: string }[] = [];

  const run = readRun(runId);

  setStatus(runId, "running");

  const snapshot = run.snapshot;
  const promptObject = snapshot.prompt;
  const judge = snapshot.judge;

  // run AI request per input available
  for (const input of snapshot.inputs) {
    const output = await runPrompt(
      promptObject.model,
      promptObject.text,
      input.content,
      promptObject.outputSchema,
    );

    const outputText = storedOutput(output);
    const result = saveResult(runId, input.key, outputText);

    pendingOutputs.push({ resultId: result.id, output: outputText });
  }

  if (judge) {
    const outcomes = await judgeOutputs(
      judge,
      pendingOutputs.map((p) => p.output),
    );
    saveJudgeOutcomes(outcomes, pendingOutputs);
  }

  setStatus(runId, "done");
}

function saveJudgeOutcomes(
  outcomes: JudgeOutcome[],
  outputs: { resultId: number; output: string }[],
) {
  for (const [i, outcome] of outcomes.entries()) {
    const resultId = outputs[i].resultId;
    if ("verdict" in outcome) {
      db.update(results)
        .set({
          status: "judged",
          judgeResults: outcome.verdict,
          judgeError: null,
        })
        .where(eq(results.id, resultId))
        .run();
    } else {
      db.update(results)
        .set({
          status: "judge_error",
          judgeResults: null,
          judgeError: outcome.error,
        })
        .where(eq(results.id, resultId))
        .run();
    }
  }
}

// The run queue lives in memory, so a restart leaves any run it was executing
// stuck in a non-terminal state with no process to finish it. Call at boot,
// after migrations and before serving, and return the ids that were buried.
export function interruptLeftoverRuns(): number[] {
  const nonTerminal: RunState[] = ["pending", "running", "stopping"];
  const buried = db
    .update(runs)
    .set({ status: "interrupted" })
    .where(inArray(runs.status, nonTerminal))
    .returning({ id: runs.id })
    .all();
  return buried.map((run) => run.id);
}

function failureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000); // provider errors can be long
}

export function markRunFailed(runId: number, error: unknown): void {
  const message = failureMessage(error);
  console.error(`run ${runId} failed: ${message}`);
  db.update(runs)
    .set({ status: "failed", error: message })
    .where(eq(runs.id, runId))
    .run();
}

// converts runPrompt returned object into a text the results table (db) accepts
function storedOutput({
  text,
  object,
}: {
  text: string;
  object?: unknown;
}): string {
  return object === undefined ? text : JSON.stringify(object);
}
