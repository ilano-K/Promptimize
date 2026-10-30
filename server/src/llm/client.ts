import type { LanguageModel } from "ai";
import type { ProviderKind } from "@promptimize/shared";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";

import { getConfig } from "../config";
import { assertModelConfigured } from "./models";
import { MissingBaseUrlError, ModelNotConfiguredError } from "../errors/domain";
import { parseModelId } from "../lib/llm";

// Configure base url based on the providerId (Map)
const DEFAULT_BASE: Record<ProviderKind, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  google: "https://generativelanguage.googleapis.com",
  openrouter: "https://openrouter.ai/api",
  ollama: "http://localhost:11434",
  "openai-compatible": "",
};
// resolve model: returns a LanguageModel object based on provider
export function resolveModel(modelId: string): LanguageModel {
  // Validate the model: 1. follows provider/model format | 2. model is in config
  assertModelConfigured(modelId);

  const { providerId, modelName } = parseModelId(modelId);
  const config = getConfig();
  const provider = config.providers.find((p) => p.id === providerId)!;
  const base = provider.baseUrl || DEFAULT_BASE[provider.kind];
  if (provider.kind === "openai-compatible" && !base) {
    throw new MissingBaseUrlError(provider.id);
  }
  switch (provider.kind) {
    case "anthropic":
      return createAnthropic({
        apiKey: provider.apiKey,
        baseURL: `${base}/v1`,
      })(modelName);
    case "openai":
      return createOpenAI({
        apiKey: provider.apiKey,
        baseURL: `${base}/v1`,
      })(modelName);
    case "google":
      return createGoogleGenerativeAI({
        apiKey: provider.apiKey,
        baseURL: `${base}/v1beta`,
      })(modelName);
    case "openrouter":
    case "ollama":
    case "openai-compatible":
      return createOpenAICompatible({
        name: provider.kind,
        apiKey: provider.apiKey ?? "ollama",
        baseURL: base.endsWith("/v1") ? base : `${base}/v1`,
      })(modelName);

    default:
      throw new ModelNotConfiguredError(modelId);
  }
}
