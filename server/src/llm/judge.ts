import {
  type Characteristics,
  type JsonSchema,
  type Judge,
} from "@promptimize/shared";
import { IncompleteOutput, ValidationError } from "../errors/domain";
import { runPrompt } from "./generate";

export type JudgeVerdict = Record<string, string | number>;
export type JudgeOutcome = { verdict: JudgeVerdict } | { error: string };

export async function judgeOutputs(
  judge: Pick<Judge, "model" | "mode" | "basePrompt" | "characteristics">,
  outputs: string[],
): Promise<JudgeOutcome[]> {
  const judgeOutcome: JudgeOutcome[] = [];

  if (judge.mode === "individual") {
    for (const output of outputs) {
      const result = await judgeIndividual(
        judge.model,
        judge.basePrompt,
        output,
        judge.characteristics,
      );

      judgeOutcome.push(result);
    }
    return judgeOutcome;
  }
  return judgeBatch(
    judge.model,
    judge.basePrompt,
    outputs,
    judge.characteristics,
  );
}

async function judgeIndividual(
  model: string,
  basePrompt: string,
  output: string,
  characteristics: Characteristics,
): Promise<JudgeOutcome> {
  const prompt = buildJudgePrompt(basePrompt, [output]);
  const schema = buildJudgeOutputSchema(characteristics);

  try {
    const { object } = await runPrompt(model, prompt, "", schema);
    return { verdict: object as JudgeVerdict };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function judgeBatch(
  model: string,
  basePrompt: string,
  outputs: string[],
  characteristics: Characteristics,
): Promise<JudgeOutcome[]> {
  const prompt = buildJudgePrompt(basePrompt, outputs);
  const entry = buildJudgeOutputSchema(characteristics);
  // The entry schema validates each verdict's shape; the count is checked below,
  // so a mismatch produces "returned 3 verdicts for 5 outputs" instead of a
  // generic "must NOT have more than 5 items".
  const schema = { type: "array", items: entry };

  try {
    const { object } = await runPrompt(model, prompt, "", schema);
    const verdicts = object as JudgeVerdict[];

    if (verdicts.length !== outputs.length) {
      throw new IncompleteOutput(model, verdicts.length, outputs.length);
    }
    return verdicts.map((verdict) => ({ verdict }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return outputs.map(() => ({ error: message }));
  }
}

// converts characteristic objects (name: string, type: text | number) to a valid JsonSchema
export function buildJudgeOutputSchema(
  characteristics: Characteristics,
): JsonSchema {
  return {
    type: "object",
    properties: Object.fromEntries(
      characteristics.map(({ name, type }) => [
        name,
        type === "text"
          ? { type: "string", minLength: 1 }
          : { type: "number", minimum: 0, maximum: 1 },
      ]),
    ),
    required: characteristics.map(({ name }) => name),
    additionalProperties: false,
  };
}
// outputs to judge accepts one or multiple outputs from runPrompt()
export function buildJudgePrompt(
  basePrompt: string,
  outputsToJudge: string[],
): string {
  if (outputsToJudge.length === 0) {
    throw new ValidationError("A judge needs at least one output to evaluate");
  }

  const outputs = outputsToJudge
    .map((output, index) => `Output ${index + 1}:\n"""\n${output}\n"""`)
    .join("\n\n");
  return (
    basePrompt +
    "\n\nNumber characteristics are scores from 0 (worst) to 1 (best)." +
    "\nText characteristics are short written feedback." +
    `\n\nOutputs to judge:\n${outputs}`
  );
}
