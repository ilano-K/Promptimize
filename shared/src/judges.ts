import { z } from "zod";

const validModes = ["individual", "batch"] as const;

export const characteristic = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["text", "number"]),
});

export const judge = z.object({
  id: z.number(),
  projectId: z.number(),
  name: z.string(),
  basePrompt: z.string(),
  characteristics: z.array(characteristic),
  mode: z.enum(validModes),
  model: z.string(),
});

export const createJudgeBody = z.object({
  name: z.string().trim().min(1),
  basePrompt: z.string().trim().min(1),
  characteristics: z.array(characteristic),
  mode: z.enum(validModes),
  model: z.string().trim().min(1),
});

export const updateJudgeBody = createJudgeBody
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "nothing to update",
  });

export type Characteristic = z.infer<typeof characteristic>;
export type Judge = z.infer<typeof judge>;
export type CreateJudgeBody = z.infer<typeof createJudgeBody>;
export type UpdateJudgeBody = z.infer<typeof updateJudgeBody>;
