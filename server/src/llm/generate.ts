import { generateText } from "ai";
import { resolveModel } from "./client";
import { getValidator, formatErrors, assertValidSchema } from "./schema";
import type { JsonSchema } from "@promptimize/shared";
import { InvalidOutput } from "../errors/domain";
import { extractJson, preview, rawPreview, schemaInstruction } from "../lib/llm";
import { errorDetails, log } from "../lib/log";

interface GenerationOptions {
  temperature?: number;
}



export async function runPrompt(
  modelId: string,
  promptText: string,
  input: string,
  outputSchema: JsonSchema | null,
  options: GenerationOptions = {},
): Promise<{ text: string; object?: unknown }> {
  const model = resolveModel(modelId);
  const text = promptText.replaceAll("{{input}}", input);

  // free-form path (no output schema)
  if (!outputSchema) {
    try {
      const result = await generateText({
        model,
        prompt: text,
        temperature: 0,
        ...options,
      });
      return { text: result.text };
    } catch (error) {
      log("ERROR", "ai.call_failed", { model: modelId, ...errorDetails(error) });
      throw error;
    }
  }

  // structured path: ask for JSON, then enforce the schema ourselves
  assertValidSchema(outputSchema); // a schema saved before save-time validation existed
  const validate = getValidator(outputSchema);
  let result;
  try {
    result = await generateText({
      model,
      prompt: text + schemaInstruction(outputSchema),
      temperature: 0,
      ...options,
    });
  } catch (error) {
    log("ERROR", "ai.call_failed", { model: modelId, ...errorDetails(error) });
    throw error;
  }

  const parsed = extractJson(result.text);
  if (parsed === undefined) {
    log("ERROR", "ai.invalid_json", { model: modelId, raw: rawPreview(result.text) });
    throw new InvalidOutput(
      modelId,
      `response was not JSON: ${preview(result.text)}`,
    );
  }

  if (!validate(parsed)) {
    log("ERROR", "ai.invalid_schema", {
      model: modelId,
      errors: formatErrors(validate),
      raw: rawPreview(result.text),
    });
    throw new InvalidOutput(modelId, formatErrors(validate));
  }

  return { text: result.text, object: parsed };
}
