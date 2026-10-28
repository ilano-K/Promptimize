import { z } from "zod";

const validLabels = ["train", "validation", "test"] as const;

export const input = z.object({
  id: z.number(),
  projectId: z.number(),
  content: z.string(),
  description: z.string().nullable(),
  label: z.enum(validLabels),
});

export const createInputBody = z.object({
  content: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  label: z.enum(validLabels),
});

export const updateInputBody = z
  .object({
    content: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).nullable().optional(),
    label: z.enum(validLabels).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export type Input = z.infer<typeof input>;
export type CreateInputBody = z.infer<typeof createInputBody>;
export type UpdateInputBody = z.infer<typeof updateInputBody>;
