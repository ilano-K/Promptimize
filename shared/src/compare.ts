import z from "zod";
import { inputLabels } from "./inputs";
import { result } from "./result";
import { runDetail } from "./runs";

const compareTagKind = [
  "prompt.text",
  "prompt.model",
  "prompt.outputSchema",
  "judge.present",
  "judge.basePrompt",
  "judge.characteristics",
  "judge.mode",
  "judge.model",
  "input.present",
  "input.content",
  "input.label",
  "model.present",
  "model.kind",
  "model.baseUrl",
] as const;

// === `target` names the member of a collection. Prompt and judge are
// === singular, so their tags carry `target: null`. Inputs and models are
// === collections, so their tags carry the input key / model id. ===
// {
//   "kind": "judge.basePrompt",
//   "target": null,
//   "a": "You are a strict grader.",
//   "b": "You are a lenient grader."
// }
export const compareTag = z.object({
  kind: z.enum(compareTagKind), // which field changed
  // the name of the object that changed: an input key or a model id.
  // null when the object is singular (prompt, judge), because "which one"
  // has no answer when there is only one.
  target: z.string().nullable(),
  a: z.string().nullable(),
  b: z.string().nullable(),
});

// One row per original library input: the two runs' results side by side.
// A null side means that run never ran this input, so the screen shows
// "only in run A" / "only in run B" without having to pair anything itself.
export const compareRow = z.object({
  inputKey: z.string(), // the snapshot input key, the same one results point at
  label: z.enum(inputLabels),
  content: z.string(), // the text the prompt saw, from run A when both have it
  a: result.nullable(),
  b: result.nullable(),
});

export const comparison = z.object({
  a: runDetail,
  b: runDetail,
  tags: z.array(compareTag),
  rows: z.array(compareRow),
});

export type CompareTagKind = (typeof compareTagKind)[number];
export type CompareTag = z.infer<typeof compareTag>;
export type CompareRow = z.infer<typeof compareRow>;
export type Comparison = z.infer<typeof comparison>;
