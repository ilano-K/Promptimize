import { ValidationError } from "../errors/domain";

export function parseId(id: string, entity: string) {
  const parsed = Number(id);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`Invalid ${entity} ID`);
  }
  return parsed;
}
