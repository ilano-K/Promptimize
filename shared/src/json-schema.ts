import { z } from "zod";

// A JSON Schema object. Stored as JSON text; null means "no schema set".
export const jsonSchema = z.record(z.string(), z.unknown());
export type JsonSchema = z.infer<typeof jsonSchema>;
