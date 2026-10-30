import { getConfig } from "../config";
import { ModelNotConfiguredError } from "../errors/domain";
import { parseModelId } from "../lib/llm";

export function assertModelConfigured(model: string): void {
  const { providerId, modelName } = parseModelId(model);
  const config = getConfig();
  const provider = config.providers.find((p) => p.id === providerId);
  const modelExists = provider?.models.includes(modelName);

  if (!modelExists) {
    throw new ModelNotConfiguredError(model);
  }
}
