import { getConfig } from "../config";
import { ModelNotConfiguredError } from "../errors/domain";

export function assertModelConfigured(model: string): void {
  const [providerId, ...rest] = model.split("/");
  const modelName = rest.join("/");
  const config = getConfig();
  const provider = config.providers.find((p) => p.id === providerId);
  const modelExists = provider?.models.includes(modelName);

  if (!modelExists) {
    throw new ModelNotConfiguredError(model);
  }
}
