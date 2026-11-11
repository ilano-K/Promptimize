import type {
  CompareRow,
  CompareTag,
  Comparison,
  RunDetail,
  Snapshot,
} from "@promptimize/shared";
import { readRunDetail } from "./runs.service";

export function compare(runAId: number, runBId: number): Comparison {
  const runA = readRunDetail(runAId);
  const runB = readRunDetail(runBId);

  const compareTags: CompareTag[] = diffSnapshots(runA.snapshot, runB.snapshot);

  return {
    a: runA,
    b: runB,
    tags: compareTags,
    rows: pairResults(runA, runB),
  };
}

// ======================================================
// === Pair both runs' results by original input key   ==
// ======================================================

/**
 * One row per input either run saw.
 *
 * Run A's order first, then inputs only run B has: the screen renders rows in
 * this order and never has to sort. A missing side is null, not an empty
 * result, so "never ran" stays distinguishable from "ran and produced nothing".
 */
export function pairResults(a: RunDetail, b: RunDetail): CompareRow[] {
  const inputsA = new Map(a.snapshot.inputs.map((i) => [i.key, i]));
  const inputsB = new Map(b.snapshot.inputs.map((i) => [i.key, i]));
  const resultsA = new Map(a.results.map((r) => [r.snapshotInputKey, r]));
  const resultsB = new Map(b.results.map((r) => [r.snapshotInputKey, r]));

  // Results point at snapshot keys written when the run started, so every
  // result key is already in one of the snapshots: no orphan rows to invent
  // a label for.
  const keys = [
    ...inputsA.keys(),
    ...[...inputsB.keys()].filter((key) => !inputsA.has(key)),
  ];

  const rows: CompareRow[] = [];
  for (const key of keys) {
    const ia = inputsA.get(key);
    const ib = inputsB.get(key);
    // A run without the input still knows its label from the snapshot of the
    // run that had it, so a missing side never blanks the row header.
    const source = ia ?? ib;
    if (!source) continue;

    rows.push({
      inputKey: key,
      label: source.label,
      content: ia?.content ?? source.content,
      a: resultsA.get(key) ?? null,
      b: resultsB.get(key) ?? null,
    });
  }

  return rows;
}

// ========================================================
// === Diff two snapshots into one tag per changed field ==
// ========================================================

// Snapshot objects are stored as JSON, so `===` cannot tell "equal" from
// different object with the same content. Serialize with sorted keys instead:
// key order in the stored JSON is not a difference anyone can see.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));

  const body = entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${body.join(",")}}`;
}

// Tags carry readable text, never JSON blobs. null means "absent on this side".
function show(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return canonical(value);
}

/**
 * Every field that differs between two run snapshots, as a tag.
 *
 * Tags warn; they never block. `version` and `createdAt` are skipped on
 * purpose: they always differ and say nothing about what the run did.
 */
export function diffSnapshots(a: Snapshot, b: Snapshot): CompareTag[] {
  const tags: CompareTag[] = [];

  const tag = (
    kind: CompareTag["kind"],
    target: string | null,
    x: unknown,
    y: unknown,
  ) => {
    if (canonical(x) === canonical(y)) return;
    tags.push({ kind, target, a: show(x), b: show(y) });
  };

  // ---- Prompt (singular, so target is null) ----
  tag("prompt.text", null, a.prompt.text, b.prompt.text);
  tag("prompt.model", null, a.prompt.model, b.prompt.model);
  tag(
    "prompt.outputSchema",
    null,
    a.prompt.outputSchema,
    b.prompt.outputSchema,
  );

  // ---- Judge (singular) ----
  const ja = a.judge;
  const jb = b.judge;
  if (!ja || !jb) {
    // One cause, one tag. Emitting basePrompt/mode/model too would describe
    // fields that no longer exist on one side.
    if (ja !== jb) tag("judge.present", null, ja?.name, jb?.name);
  } else {
    tag("judge.basePrompt", null, ja.basePrompt, jb.basePrompt);
    tag("judge.characteristics", null, ja.characteristics, jb.characteristics);
    tag("judge.mode", null, ja.mode, jb.mode);
    tag("judge.model", null, ja.model, jb.model);
  }

  // ---- Models (a map, so target is the model id) ----
  const modelIds = [
    ...new Set([...Object.keys(a.models), ...Object.keys(b.models)]),
  ].sort();
  for (const id of modelIds) {
    const ma = a.models[id];
    const mb = b.models[id];
    if (!ma || !mb) {
      if (ma !== mb) tag("model.present", id, ma ? id : null, mb ? id : null);
      continue;
    }
    tag("model.kind", id, ma.kind, mb.kind);
    tag("model.baseUrl", id, ma.baseUrl ?? null, mb.baseUrl ?? null);
  }

  // ---- Inputs (a list, so target is the snapshot input key) ----
  const byKey = (s: Snapshot) => new Map(s.inputs.map((i) => [i.key, i]));
  const inputsA = byKey(a);
  const inputsB = byKey(b);
  const inputKeys = [...new Set([...inputsA.keys(), ...inputsB.keys()])].sort();
  for (const key of inputKeys) {
    const ia = inputsA.get(key);
    const ib = inputsB.get(key);
    if (!ia || !ib) {
      if (ia !== ib) tag("input.present", key, ia?.content, ib?.content);
      continue;
    }
    tag("input.content", key, ia.content, ib.content);
    tag("input.label", key, ia.label, ib.label);
  }

  return tags;
}
