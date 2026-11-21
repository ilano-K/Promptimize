import type { JsonSchema } from "@promptimize/shared";

export function parseModelId(modelId: string) {
  const [providerId, ...rest] = modelId.split("/");
  const modelName = rest.join("/");

  return {
    providerId,
    modelName,
  };
}

// extracts valid JSON from AI-generated text by removing Markdown code fences
// and surrounding text, then parses the JSON.
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/, "")
    .trim();

  const start = unfenced.search(/[{[]/);
  const end = Math.max(unfenced.lastIndexOf("}"), unfenced.lastIndexOf("]"));

  const candidates = [
    trimmed,
    unfenced,
    start !== -1 && end > start ? unfenced.slice(start, end + 1) : "",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next candidate */
    }
  }

  return undefined;
}

export const preview = (text: string) =>
  JSON.stringify(text.length > 120 ? `${text.slice(0, 120)}...` : text);

// For logs: truncate without JSON.stringify so log() escapes the text once.
export const rawPreview = (text: string) =>
  text.length > 120 ? `${text.slice(0, 120)}...` : text;

// Not every provider is compatible with a response_format, so the schema is described in
// the prompt as well
export function schemaInstruction(schema: JsonSchema): string {
  return (
    `\n\nRespond with a single JSON value that conforms to this JSON Schema.` +
    `\nOutput only the JSON: no prose, no explanation, no markdown fences.` +
    `\nSchema: ${JSON.stringify(schema)}`
  );
}
