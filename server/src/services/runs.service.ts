import {
  isTerminalRun,
  runStatuses,
  type Result,
  type Run,
  type RunDetail,
  type RunState,
} from "@promptimize/shared";
import { readExperiment } from "./experiments.service";
import { readPrompt } from "./prompts.service";
import { NotFoundError, ValidationError } from "../errors/domain";
import { readJudge } from "./judges.service";
import { buildSnapshot } from "../lib/snapshot";
import { log } from "../lib/log";
import { readInput } from "./inputs.service";
import { getConfig } from "../config";
import { db } from "../db";
import { results, runs } from "../db/schemas";
import { eq, inArray } from "drizzle-orm";
import { runPrompt } from "../llm/generate";
import { listResults, saveResult } from "./results.service";
import { judgeOutputs, type JudgeOutcome } from "../llm/judge";
import {
  isRunActive,
  isStopRequested,
  queueRun,
  requestStop,
} from "../jobs/runs";

// ===============================
// === READ a SINGLE run ===
// ===============================
export function readRun(runId: number): Run {
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) {
    throw new NotFoundError("run", runId);
  }
  return run;
}

// ================================
// ===== LIST EXPERIMENT runs =====
// ================================

export function listRuns(experimentId: number): Run[] {
  readExperiment(experimentId);
  const data = db
    .select()
    .from(runs)
    .where(eq(runs.experimentId, experimentId))
    .all();

  return data;
}

// ========================================================
// ===== Read run, results, and aggregated progress =======
// ========================================================
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

// ==============================================================
// === Retries the inputs where error occured during judging ====
// ==============================================================
export async function retryJudging(runId: number): Promise<void> {
  const run = readRun(runId);
  // REFUSE if a job is already ACTIVE for it
  if (isRunActive(runId)) {
    throw new ValidationError(
      "Run is currently executing; wait for it to finish or cancel it.",
    );
  }

  // REFUSE if snapshot.judge is NULL (prompt-only / without a judge - run)
  if (run.snapshot.judge === null) {
    throw new ValidationError(
      "Cannot evaluate this run because no judge is configured. Please add a judge and try again.",
    );
  }
  // COLLECT the rows still in `judge_error` and REFUSE if there are NONE.
  const results = listResults(runId);
  const resultsToRetry = results.filter((r) => r.status === "judge_error");
  if (resultsToRetry.length === 0) {
    throw new ValidationError("This run has no failed judgements to retry.");
  }
  // SET `running` -> QUEUE the JOB, RETURN
  setStatus(runId, "running");
  void queueRun(
    runId,
    () => executeJudging(runId, resultsToRetry),
    markRetryFailed,
  );
}

// ===================================================
// === EXECUTE a JUDGE run, used by `retryJudging` ===
// ===================================================
async function executeJudging(runId: number, resultsToRetry: Result[]) {
  // CHECK if the run is REQUESTED for STOPPING
  if (isStopRequested(runId)) {
    setStatus(runId, "cancelled");
    return;
  }

  const run = readRun(runId);
  const judge = run.snapshot.judge!;

  // GENERATE judge outputs
  const outcomes = await judgeOutputs(
    judge,
    resultsToRetry.map((r) => r.output),
  );

  // SAVE judge outputs
  saveJudgeOutcomes(
    runId,
    outcomes,
    resultsToRetry.map((r) => ({ resultId: r.id, output: r.output })),
  );

  // SET status to: `cancelled` if the run is requested for stopping, else `done`
  setStatus(runId, isStopRequested(runId) ? "cancelled" : "done");
}

// ============================
// === MARK run as started  ===
// ============================
export function startRun(experimentId: number): Run {
  const experiment = readExperiment(experimentId);

  // validate prompt, judge, input exists
  if (experiment.promptId === null)
    throw new ValidationError(
      `The prompt for experiment ${experimentId} was deleted; pick another before running.`,
    );

  if (experiment.inputIds.length === 0)
    throw new ValidationError(
      `Experiment ${experimentId} has no inputs; add at least one before running.`,
    );
  const judge =
    experiment.judgeId === null ? null : readJudge(experiment.judgeId);

  const prompt = readPrompt(experiment.promptId);

  const inputs = experiment.inputIds.map(readInput);

  // BUILD snapshot
  const snapshot = buildSnapshot({
    prompt,
    judge,
    inputs,
    providers: getConfig().providers,
    now: new Date(),
  });

  // INSERT and RETURN run
  const [run] = db
    .insert(runs)
    .values({ experimentId, snapshot, startedAt: snapshot.createdAt })
    .returning()
    .all();

  return run;
}

// ===========================
// === MARK run as stopped ===
// ===========================
export function stopRun(runId: number): boolean {
  const run = readRun(runId);
  // CHECK if the state is TERMINAL -> leave the state untouched
  if (isTerminalRun(run.status)) return false;

  // REQUEST the run for stopping by flagging
  if (!requestStop(runId)) {
    // The run isn't owned by any job; stale
    setStatus(runId, "cancelled");
    log("INFO", "run.cancelled", { runId, reason: "stale" });
    return true;
  }

  // SET status to stop and RETURN
  setStatus(runId, "stopping");
  log("INFO", "run.stopped", { runId });
  return true;
}

// ===================================================
// === EXECUTE a run (responsive to stop requests) ===
// ===================================================
export async function executeRun(runId: number): Promise<void> {
  // SAVE LLM outputs used by judge runs
  const pendingOutputs: { resultId: number; output: string }[] = [];
  const run = readRun(runId);

  // CHECK if the run is REQUESTED FOR STOPPING
  if (isStopRequested(runId)) {
    setStatus(runId, "cancelled");
    log("INFO", "run.cancelled", { runId, reason: "before_start" });
    return;
  }

  // SET status to `running`
  setStatus(runId, "running");
  log("INFO", "run.started", { runId, experimentId: run.experimentId });

  const snapshot = run.snapshot;
  const promptObject = snapshot.prompt;
  const judge = snapshot.judge;

  // RUN LLM request for every input (`snapshot.inputs`) available
  for (const input of snapshot.inputs) {
    // CHECK if the run is REQUESTED FOR STOPPING mid-run
    if (isStopRequested(runId)) break;

    // CALL llm
    const output = await runPrompt(
      promptObject.model,
      promptObject.text,
      input.content,
      promptObject.outputSchema,
    );

    // PARSE llm output as a string and SAVE result
    const outputText = storedOutput(output);
    const result = saveResult(runId, input.key, outputText);

    pendingOutputs.push({ resultId: result.id, output: outputText });
  }

  // A cancelled run is not half-evaluated: skip judging entirely.
  if (isStopRequested(runId)) {
    setStatus(runId, "cancelled");
    log("INFO", "run.cancelled", { runId, reason: "before_judging" });
    return;
  }

  // CHECK if run is a JUDGE run
  if (judge) {
    // CALL llm; use the stored outputs generated by `runPrompt`
    const outcomes = await judgeOutputs(
      judge,
      pendingOutputs.map((p) => p.output),
    );
    // SAVE judge outputs
    saveJudgeOutcomes(runId, outcomes, pendingOutputs);
  }

  // SET status to: `cancelled` if the run is requested for stopping mid-run, else `done`
  const finalStatus = isStopRequested(runId) ? "cancelled" : "done";
  setStatus(runId, finalStatus);
  log("INFO", finalStatus === "done" ? "run.done" : "run.cancelled", {
    runId,
    results: pendingOutputs.length,
  });
}

// ===========================
// === SAVE JUDGE OUTCOMES ===
// ===========================
function saveJudgeOutcomes(
  runId: number,
  outcomes: JudgeOutcome[],
  outputs: { resultId: number; output: string }[],
) {
  // UPDATE `results` table depending on the judge outcomes
  // `verdict`: SET `results` `status` to `judged` and `judgeResults` to the outcome's verdict
  // `judge_error`: SET `results` `status` to `judge_error` with empty `judgeResults`
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
      log("WARN", "judge.error", { runId, resultId, error: outcome.error });
    }
  }
}

// ==========================================================================
// ==== PROCESS runs that were interrupted with no process to finish it  ====
// ========= by having each run `status` SET to `interrupted` ===============
// ==========================================================================
export function interruptLeftoverRuns(): number[] {
  const nonTerminal = runStatuses.filter((status) => !isTerminalRun(status));
  const buried = db
    .update(runs)
    .set({ status: "interrupted" })
    .where(inArray(runs.status, nonTerminal))
    .returning({ id: runs.id })
    .all();
  return buried.map((run) => run.id);
}

// =============================================
// == `onError` functions used by `queueRun` ===
// =============================================
export function markRunFailed(runId: number, error: unknown): void {
  // logs run error, and UPDATE run `status` to failed and `message` to error message
  const message = failureMessage(error);
  console.error(`run ${runId} failed: ${message}`);
  log("ERROR", "run.failed", { runId, error: message });
  db.update(runs)
    .set({ status: "failed", error: message })
    .where(eq(runs.id, runId))
    .run();
}

function markRetryFailed(runId: number, error: unknown): void {
  // only judging was retried, so logs retry error and LEAVE run `status` at
  // done: outputs are complete and failed would hide the retry button
  console.error(`run ${runId}: retry judging failed: ${failureMessage(error)}`);
  log("ERROR", "run.retry_failed", {
    runId,
    error: failureMessage(error),
  });
  setStatus(runId, "done");
}

// === PARSE error message; used by `markRunFailed` & `markRetryFailed` ===
function failureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000); // provider errors can be long
}

// === HELPER for setting status in DB ===
function setStatus(runId: number, status: RunState): void {
  db.update(runs).set({ status }).where(eq(runs.id, runId)).run();
}

// === CONVERT runPrompt returned object into a text the results table (db) accepts ===
function storedOutput({
  text,
  object,
}: {
  text: string;
  object?: unknown;
}): string {
  return object === undefined ? text : JSON.stringify(object);
}
