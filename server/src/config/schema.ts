import { providerSchema } from "@promptimize/shared";
import { z } from "zod";

export const ConfigSchema = z.object({
  defaultOptimizerModel: z.string().default(""),
  providers: z.array(providerSchema).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;
