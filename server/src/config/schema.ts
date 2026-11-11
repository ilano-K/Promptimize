import { providerSchema } from "@promptimize/shared";
import { z } from "zod";

export const ConfigSchema = z.object({
  providers: z.array(providerSchema).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;
