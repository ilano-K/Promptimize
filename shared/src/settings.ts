import z from "zod";

const validKinds = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "ollama",
  "openai-compatible",
] as const;

export const createProviderBody = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(validKinds),
  baseUrl: z.url({ message: "Must be a valid URL" }).optional().or(z.literal("")),
  apiKey: z.string().trim().optional(),
  models: z.array(z.string().trim().min(1)),
});

export const updateProviderBody = createProviderBody
  .omit({ kind: true })
  .partial()
  .extend({ apiKey: z.string().optional() }); // allow empty string (for removal)

export const providerSchema = createProviderBody.extend({
  id: z.string(),
});

export const updateSettingsBody = z.object({
  defaultOptimizerModel: z.string().trim().min(1).max(100).optional(),
});

export const providerConnectionBody = z.object({
  kind: z.enum(validKinds),
  apiKey: z.string().trim().min(1).optional(),
  baseUrl: z.url().optional().or(z.literal("")),
});

export type CreateProviderBody = z.infer<typeof createProviderBody>;
export type UpdateProviderBody = z.infer<typeof updateProviderBody>;
export type UpdateSettingsBody = z.infer<typeof updateSettingsBody>;
export type Provider = z.infer<typeof providerSchema>;
export type SafeProvider = Omit<Provider, "apiKey"> & {
  hasKey: boolean;
};
export type ProviderConnectionBody = z.infer<typeof providerConnectionBody>;

export type ProviderKind = (typeof validKinds)[number];

export type SettingsResponse = {
  defaultOptimizerModel: string;
  providers: SafeProvider[];
};

export type TestConnectionResponse = {
  success: boolean;
  status: number | null;
  ms: number;
  error?: string;
};

export type FetchModelsResponse = {
  success: boolean;
  models: string[];
  error?: string;
};
