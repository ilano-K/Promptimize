import type {
  CreateProviderBody,
  Provider,
  ProviderConnectionBody,
  SafeProvider,
  Settings,
  UpdateProviderBody,
} from "@promptimize/shared";
import { getConfig, saveConfig } from "../config";
import { modelsUrls, providerAdapters } from "../llm/provider";
import { DuplicateNameError, NotFoundError } from "../errors/domain";

// READ settings
export function readSettings(): Settings {
  const config = getConfig();

  // remove apiKey and return hasKey instead
  const safeProviders: SafeProvider[] = config.providers.map((provider) =>
    toSafeProvider(provider),
  );

  return {
    providers: safeProviders,
  };
}

// CREATE settings
export function createProvider(data: CreateProviderBody): SafeProvider {
  const config = getConfig();

  // provider names are unique, case-insensitive
  const nameTaken = config.providers.some(
    (p) => p.name.toLowerCase() === data.name.toLowerCase(),
  );
  if (nameTaken) throw new DuplicateNameError("provider", data.name);

  const provider: Provider = {
    id: createProviderId(data.name, config.providers),
    ...data,
  };

  config.providers.push(provider);
  saveConfig(config);

  return toSafeProvider(provider);
}

// UPDATE provider
export function updateProvider(id: string, data: UpdateProviderBody) {
  const config = getConfig();
  const targetProvider = config.providers.find((p) => p.id === id);

  if (!targetProvider) throw new NotFoundError("provider", id);

  // update name
  if (data.name) {
    const name = data.name;
    // provider names are unique, case-insensitive
    const nameTaken = config.providers.some(
      (p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase(),
    );
    if (nameTaken) throw new DuplicateNameError("provider", name);
    targetProvider.name = name;
  }
  // update baseUrl (an empty string clears it back to the kind's default)
  if ("baseUrl" in data) {
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

  return toSafeProvider(targetProvider);
}

// DELETE provider
export function deleteProvider(id: string) {
  const config = getConfig();

  if (!config.providers.some((p) => p.id === id)) {
    throw new NotFoundError("provider", id);
  }

  config.providers = config.providers.filter((p) => p.id !== id);
  saveConfig(config);
}

// ====== NETWORK ======
export async function testProviderConnection(data: ProviderConnectionBody) {
  const urlToFetch = modelsUrls[data.kind](data.baseUrl);
  const adapter = providerAdapters[data.kind];

  const result = await adapter.testConnection(data.apiKey, urlToFetch);
  return result;
}

export async function fetchProviderModels(data: ProviderConnectionBody) {
  const urlToFetch = modelsUrls[data.kind](data.baseUrl);
  const adapter = providerAdapters[data.kind];

  const result = await adapter.fetchModels(data.apiKey, urlToFetch);
  return result;
}

// ====== HELPERS ======
function toSafeProvider(provider: Provider) {
  const { apiKey, ...safeProvider } = provider;

  return {
    ...safeProvider,
    hasKey: Boolean(apiKey?.trim()),
  };
}

function createProviderId(
  name: string,
  existingProviders: { id: string }[],
): string {
  const baseId = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // provider names are unique; ids still need to dodge slug collisions
  let id = baseId;
  let number = 1;

  while (existingProviders.some((p) => p.id === id)) {
    id = `${baseId}-${number}`;
    number++;
  }

  return id;
}
