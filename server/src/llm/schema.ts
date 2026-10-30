import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import type { JsonSchema } from "@promptimize/shared";
import { ValidationError } from "../errors/domain";

// One Ajv for the process, speaking the 2020-12 vocabulary (prefixItems,
// unevaluatedProperties, $defs, ...). strictSchema stays at its default (on),
// so a keyword this instance does not know throws instead of being ignored.
const ajv = new Ajv2020({ allErrors: true, strictTuples: false });

// Ajv repeats the same reason once per alternative in a union, so collapse
// duplicates before showing them to a user.
const cleanErrors = (text: string) => [...new Set(text.split(", "))].join(", ");

// Compiled validators, keyed by schema text. The same schema is reused across
// inputs and optimize rounds, so it is compiled once per distinct schema.
const validators = new Map<string, ValidateFunction>();

export function getValidator(schema: JsonSchema): ValidateFunction {
  const key = JSON.stringify(schema);

  const cached = validators.get(key);
  if (cached) return cached;

  const compiled = ajv.compile(schema);
  validators.set(key, compiled);
  return compiled;
}

// Human-readable reason the last validation failed, e.g.
// "data must have required property 'summary'".
export function formatErrors(validate: ValidateFunction): string {
  return cleanErrors(ajv.errorsText(validate.errors));
}

// Rejects a schema Ajv cannot enforce. Called when a prompt is saved, so a
// malformed or unsupported schema is an editor error, not a failed run.
export function assertValidSchema(schema: JsonSchema): void {
  try {
    getValidator(schema);
  } catch (error) {
    const detail = (error as Error).message.replace(/^schema is invalid: /, "");
    throw new ValidationError(`Invalid output schema: ${cleanErrors(detail)}`);
  }
}
