import { z } from "zod";

const validModes = ["individual", "batch"] as const;

export const characteristic = z.object({
  name: z.string().trim().min(1, "Characteristic name is required."),
  type: z.enum(["text", "number"]),
});

const characteristics = z
  .array(characteristic)
  .min(1, "At least one characteristic is required.")
  .refine(
    (items) => {
      const names = items.map(({ name }) => name);
      return new Set(names).size === names.length;
    },
    { message: "Characteristic names must be unique." },
  );

export const judge = z.object({
  id: z.number(),
  projectId: z.number(),
  name: z.string(),
  basePrompt: z.string(),
  characteristics: characteristics,
  mode: z.enum(validModes),
  model: z.string(),
});

export const createJudgeBody = z.object({
  name: z.string().trim().min(1),
  basePrompt: z.string().trim().min(1),
  characteristics: characteristics,
  mode: z.enum(validModes),
  model: z.string().trim().min(1),
});

export const updateJudgeBody = createJudgeBody
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "nothing to update",
  });

export type Characteristic = z.infer<typeof characteristic>;
export type Characteristics = z.infer<typeof characteristics>;
export type Judge = z.infer<typeof judge>;
export type CreateJudgeBody = z.infer<typeof createJudgeBody>;
export type UpdateJudgeBody = z.infer<typeof updateJudgeBody>;
