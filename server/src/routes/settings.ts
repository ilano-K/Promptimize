import { Hono } from "hono";
import { getConfig, saveConfig } from "../config";
import {
  createProviderBody,
  providerConnectionBody,
  updateProviderBody,
  updateSettingsBody,
  type Provider,
  type SafeProvider,
  type SettingsResponse,
} from "@promptimize/shared";
import { validateJson } from "../lib/validate";
import { ApiError } from "../errors";
import { modelsUrls, providerAdapters } from "../llm/provider";

export const settingsRoutes = new Hono();

// READ settings
settingsRoutes.get("/", (c) => {
  const config = getConfig();

  // remove apiKey and return hasKey instead
  const safeProviders: SafeProvider[] = config.providers.map((provider) =>
    toSafeProvider(provider),
  );

  const response: SettingsResponse = {
    defaultOptimizerModel: config.defaultOptimizerModel,
    providers: safeProviders,
  };

  return c.json(response, 200);
});

// ADD providers
settingsRoutes.post("/", validateJson(createProviderBody), (c) => {
  const data = c.req.valid("json");
  const config = getConfig();

  // create id based on the name while handling duplicates (checks names too)
  const createdId = createProviderId(data.name, config.providers);
  const provider: Provider = { id: createdId, ...data };
  config.providers.push(provider);
  saveConfig(config);

  const safeProvider: SafeProvider = toSafeProvider(provider);
  return c.json(safeProvider, 201);
});

// Update provider
settingsRoutes.patch("/:id", validateJson(updateProviderBody), (c) => {
  const config = getConfig();
  const id = c.req.param("id");
  const data = c.req.valid("json");

  const targetProvider = config.providers.find((p) => p.id === id);

  if (!targetProvider)
    throw new ApiError(404, "NOT_FOUND", "Provider not found");

  // update name
  if (data.name) {
    // Check for duplicate provider names
    const nameExists = config.providers.some(
      (p) => p.name === data.name && p.id !== id,
    );
    if (nameExists)
      throw new ApiError(
        409,
        "DUPLICATE_NAME",
        "A provider with this name already exists",
      );
    targetProvider.name = data.name;
  }
  // update baseUrl
  if (data.baseUrl) {
    targetProvider.baseUrl = data.baseUrl;
  }

  // fields where empty means remove
  // update apiKey
  if ("apiKey" in data) {
    targetProvider.apiKey = data.apiKey?.trim() || "";
  }
  // update models inside it
  if ("models" in data) {
    targetProvider.models = data.models!;
  }

  // replace the target provider
  config.providers = config.providers.map((p) =>
    p.id === id ? targetProvider : p,
  );

  saveConfig(config);

  return c.json(toSafeProvider(targetProvider), 200);
});

// Remove provider
settingsRoutes.delete("/:id", (c) => {
  const config = getConfig();
  const id = c.req.param("id");

  if (!config.providers.some((p) => p.id === id))
    throw new ApiError(404, "NOT_FOUND", "Provider not found");

  config.providers = config.providers.filter((p) => p.id !== id);
  saveConfig(config);

  return c.body(null, 204);
});

// Update default optimizer
settingsRoutes.patch("/", validateJson(updateSettingsBody), (c) => {
  const data = c.req.valid("json");
  const config = getConfig();

  if (data.defaultOptimizerModel) {
    const [providerId, modelName] = data.defaultOptimizerModel!.split("/");
    const provider = config.providers.find((p) => p.id === providerId);
    const modelExists = provider?.models.includes(modelName) ?? false;

    if (!modelExists) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Model not found in configured providers",
      );
    }
    config.defaultOptimizerModel = data.defaultOptimizerModel;
  }

  saveConfig(config);

  return c.json({ defaultOptimizerModel: config.defaultOptimizerModel }, 200);
});

// Test connection by passing model kind and api key with optional base url
settingsRoutes.post(
  "/test-connection",
  validateJson(providerConnectionBody),
  async (c) => {
    const data = c.req.valid("json");
    const urlToFetch = modelsUrls[data.kind](data.baseUrl);
    const adapter = providerAdapters[data.kind];

    const result = await adapter.testConnection(data.apiKey, urlToFetch);

    return c.json(result);
  },
);

settingsRoutes.post(
  "/fetch-models",
  validateJson(providerConnectionBody),
  async (c) => {
    const data = c.req.valid("json");
    const urlToFetch = modelsUrls[data.kind](data.baseUrl);
    const adapter = providerAdapters[data.kind];

    const result = await adapter.fetchModels(data.apiKey, urlToFetch);

    return c.json(result);
  },
);

function toSafeProvider(provider: Provider) {
  const { apiKey, ...safeProvider } = provider;

  return {
    ...safeProvider,
    hasKey: Boolean(apiKey?.trim()),
  };
}

function createProviderId(
  name: string,
  existingProviders: { id: string; name: string }[],
): string {
  const baseId = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // check duplicate names (FEATURES.md: "a taken name gets a number")
  const nameLower = name.trim().toLowerCase();
  const nameExists = existingProviders.some(
    (p) => p.name.toLowerCase() === nameLower,
  );

  let id = baseId;
  let number = nameExists ? 2 : 1;

  while (existingProviders.some((p) => p.id === id)) {
    id = `${baseId}-${number}`;
    number++;
  }

  return id;
}
