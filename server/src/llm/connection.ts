import type {
  FetchModelsResponse,
  TestConnectionResponse,
} from "@promptimize/shared";

export type AdapterOptions = {
  headers?: (apiKey?: string) => Record<string, string | undefined>;
  parseModels?: (data: any) => string[];    
};

// Response with data: [{ id: string }] (OpenAI, Anthropic, OpenRouter, OpenAI-Compatible)
export type IdListResponse = {
  data?: { id: string }[];
};

// Response with models: [{ name: string }] (Ollama, Google Gemini)
export type NameListResponse = {
  models?: { name: string }[];
};

export interface ProviderAdapter {
  testConnection(
    apiKey: string | undefined,
    url: string,
  ): Promise<TestConnectionResponse>;
  fetchModels(
    apiKey: string | undefined,
    url: string,
  ): Promise<FetchModelsResponse>;
}

// 1. Default parser: OpenAI, Anthropic, OpenRouter, and OpenAI-Compatible
export const defaultParseModels = (json: IdListResponse): string[] => {
  if (Array.isArray(json?.data)) {
    return json.data.map((m) => m.id).filter(Boolean);
  }
  return [];
};

// 2. Ollama parser: uses models[].name
export const ollamaParseModels = (json: NameListResponse): string[] => {
  if (Array.isArray(json?.models)) {
    return json.models.map((m) => m.name).filter(Boolean);
  }
  return [];
};

// 3. Google Gemini parser: uses models[].name, stripping the "models/" prefix
export const googleParseModels = (json: NameListResponse): string[] => {
  if (Array.isArray(json?.models)) {
    return json.models
      .map((m) => m.name.replace(/^models\//, ""))
      .filter(Boolean);
  }
  return [];
};

function cleanHeaders(
  headers?: Record<string, string | undefined>,
): HeadersInit | undefined {
  if (!headers) return undefined;
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export function createProviderAdapter({
  headers,
  parseModels = defaultParseModels,
}: AdapterOptions): ProviderAdapter {
  return {
    async testConnection(apiKey, url) {
      const start = performance.now();

      try {
        const response = await fetch(url, {
          headers: cleanHeaders(headers?.(apiKey)),
          signal: AbortSignal.timeout(10_000),
        });

        return {
          success: response.ok,
          status: response.status,
          ms: Math.round(performance.now() - start),
          ...(response.ok ? {} : { error: `HTTP ${response.status} ${response.statusText}` }),
        };
      } catch (error) {
        return {
          success: false,
          status: null,
          ms: Math.round(performance.now() - start),
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },

    async fetchModels(apiKey, url) {
      try {
        const response = await fetch(url, {
          headers: cleanHeaders(headers?.(apiKey)),
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          return {
            success: false,
            models: [],
            error: `HTTP ${response.status} ${response.statusText}`,
          };
        }

        const result = await response.json();
        const modelsList = parseModels(result);

        return {
          success: true,
          models: modelsList,
        };
      } catch (error) {
        return {
          success: false,
          models: [],
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  };
}
