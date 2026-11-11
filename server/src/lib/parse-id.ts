import { ValidationError } from "../errors/domain";

// === Accept undefined IDs so COMPARE route can pass undefined run IDs 
// without throwing domain errors in API layer or service layer having
// to parseIDs  
export function parseId(id: string | undefined, entity: string) {
  if (id === undefined) {
    throw new ValidationError(`ID is undefined for entity: ${entity}`);
  }
  const parsed = Number(id);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`Invalid ${entity} ID`);
  }
  return parsed;
}
