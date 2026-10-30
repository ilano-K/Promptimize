import type { DomainErrorCode } from "@promptimize/shared";

// entity labels are lowercase singular ("project"); the message classes own sentence casing
const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  constructor(entity: string, id?: string | number) {
    const label = capitalize(entity);
    super(id === undefined ? `${label} not found` : `${label} ${id} not found`);
  }
}

export class DuplicateNameError extends DomainError {
  readonly code = "DUPLICATE_NAME";
  constructor(entity: string, name: string) {
    super(`A ${entity} named "${name}" already exists`);
  }
}

export class ModelNotConfiguredError extends DomainError {
  readonly code = "MODEL_NOT_CONFIGURED";
  constructor(model: string) {
    super(`Model "${model}" is not configured`);
  }
}

export class MissingBaseUrlError extends DomainError {
  readonly code = "MISSING_BASE_URL";
  constructor(provider: string) {
    super(`Provider "${provider}" needs a base URL`);
  }
}

export class InvalidOutput extends DomainError {
  readonly code = "AI_INVALID_OUTPUT";
  constructor(model: string, detail?: string) {
    const base = `Model "${model}" returned an invalid output`;
    super(detail ? `${base}: ${detail}` : base);
  }
}
