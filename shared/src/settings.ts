import z from "zod";

export const providerKinds = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "ollama",
  "openai-compatible",
] as const;

const providerShape = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(providerKinds),
  baseUrl: z.url({ message: "Must be a valid URL" }).optional().or(z.literal("")),
  apiKey: z.string().trim().optional(),
  models: z.array(z.string().trim().min(1)),
});

// openai-compatible has no default endpoint, so a base url is required for that kind
const hasBaseUrl = (data: {
  kind: (typeof providerKinds)[number];
  baseUrl?: string;
}) => data.kind !== "openai-compatible" || Boolean(data.baseUrl?.trim());

const missingBaseUrl = {
  message: "Must be a valid URL",
  path: ["baseUrl"],
};

export const createProviderBody = providerShape.refine(hasBaseUrl, missingBaseUrl);

export const updateProviderBody = providerShape
  .omit({ kind: true })
  .partial()
  .extend({ apiKey: z.string().optional() }) // allow empty string (for removal)
  .refine((body) => Object.keys(body).length > 0, {
    message: "nothing to update",
  });

export const providerSchema = providerShape.extend({
  id: z.string(),
});

export const updateSettingsBody = z
  .object({
    defaultOptimizerModel: z.string().trim().min(1).max(100).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "nothing to update",
  });

export const providerConnectionBody = z
  .object({
    kind: z.enum(providerKinds),
    apiKey: z.string().trim().min(1).optional(),
    baseUrl: z.url().optional().or(z.literal("")),
  })
  .refine(hasBaseUrl, missingBaseUrl);

export type CreateProviderBody = z.infer<typeof createProviderBody>;
export type UpdateProviderBody = z.infer<typeof updateProviderBody>;
export type UpdateSettingsBody = z.infer<typeof updateSettingsBody>;
export type Provider = z.infer<typeof providerSchema>;
export type SafeProvider = Omit<Provider, "apiKey"> & {
  hasKey: boolean;
};
export type ProviderConnectionBody = z.infer<typeof providerConnectionBody>;

export type ProviderKind = (typeof providerKinds)[number];

export type Settings = {
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
