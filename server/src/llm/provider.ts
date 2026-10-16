import type { ProviderKind } from "@promptimize/shared";
import {
  createProviderAdapter,
  googleParseModels,
  ollamaParseModels,
  type ProviderAdapter,
} from "./connection";

type ModelsUrlResolver = (baseUrl?: string) => string;

export const modelsUrls: Record<ProviderKind, ModelsUrlResolver> = {
  anthropic: (baseUrl) => `${baseUrl || "https://api.anthropic.com"}/v1/models`,
  openai: (baseUrl) => `${baseUrl || "https://api.openai.com"}/v1/models`,
  google: (baseUrl) =>
    `${baseUrl || "https://generativelanguage.googleapis.com"}/v1beta/models`,
  openrouter: (baseUrl) =>
    `${baseUrl || "https://openrouter.ai/api/v1"}/models`,
  ollama: (baseUrl) => `${baseUrl || "http://localhost:11434"}/api/tags`,
  "openai-compatible": (baseUrl) => `${baseUrl}/models`,
};

export const openaiAdapter = createProviderAdapter({
  headers: (apiKey) => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
});

export const anthropicAdapter = createProviderAdapter({
  headers: (apiKey) => ({
    ...(apiKey ? { "x-api-key": apiKey } : {}),
    "anthropic-version": "2023-06-01",
  }),
});

export const googleAdapter = createProviderAdapter({
  headers: (apiKey) => (apiKey ? { "x-goog-api-key": apiKey } : {}),
  parseModels: googleParseModels,
});

export const openRouterAdapter = createProviderAdapter({
  headers: (apiKey) => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
});

export const ollamaAdapter = createProviderAdapter({
  parseModels: ollamaParseModels,
});

export const openaiCompatibleAdapter = createProviderAdapter({
  headers: (apiKey) => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
});

export const providerAdapters: Record<ProviderKind, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  openrouter: openRouterAdapter,
  ollama: ollamaAdapter,
  "openai-compatible": openaiCompatibleAdapter,
};
