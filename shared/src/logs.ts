import { z } from "zod";

export const logFile = z.object({
  path: z.string(),
  text: z.string(),
});

export type LogFile = z.infer<typeof logFile>;
