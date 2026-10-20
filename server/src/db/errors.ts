import type { DomainErrorCode } from "@promptimize/shared";
import Database from "better-sqlite3";
import type { DomainError } from "../errors/domain";

const domainCodeBySqliteCode = {
  SQLITE_CONSTRAINT_UNIQUE: "DUPLICATE_NAME",
  SQLITE_CONSTRAINT_PRIMARYKEY: "DUPLICATE_NAME",
} satisfies Record<string, DomainErrorCode>;

export function getDomainErrorCode(
  error: unknown,
): DomainErrorCode | undefined {
  if (!(error instanceof Database.SqliteError)) return;
  const code = error.code;
  if (!(code in domainCodeBySqliteCode)) return;
  return domainCodeBySqliteCode[code as keyof typeof domainCodeBySqliteCode];
}

export type DomainErrorsByCode = Partial<Record<DomainErrorCode, DomainError>>;
export function translateDbError(
  error: unknown,
  domainErrorsByCode: DomainErrorsByCode,
) {
  const code = getDomainErrorCode(error);
  if (!code) return error;
  return domainErrorsByCode[code] ?? error;
}
