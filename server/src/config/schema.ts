import { z } from "zod";

export const ConfigSchema = z.object({
  defaultOptimizerModel: z.string().default(""),
  providers: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum([
          "anthropic",
          "openai",
          "google",
          "openrouter",
          "ollama",
          "openai-compatible",
        ]),
        name: z.string(),
        baseUrl: z.string(),
        apiKey: z.string(),
        models: z.array(z.string()),
      }),
    )
    .default([]),
});

export type Config = z.infer<typeof ConfigSchema>;
