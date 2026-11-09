import { z } from "zod";
import { jsonSchema } from "./json-schema.js";

export const prompt = z.object({
  id: z.number(),
  projectId: z.number(),
  name: z.string(),
  text: z.string(),
  model: z.string(),
  outputSchema: jsonSchema.nullable(),
});

export const createPromptBody = z.object({
  name: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1),
  model: z.string().trim().min(1).max(100),
  outputSchema: jsonSchema.optional().nullable(),
});

export const updatePromptBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    text: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    outputSchema: jsonSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "nothing to update",
  });

export type Prompt = z.infer<typeof prompt>;
export type CreatePromptBody = z.infer<typeof createPromptBody>;
export type UpdatePromptBody = z.infer<typeof updatePromptBody>;
