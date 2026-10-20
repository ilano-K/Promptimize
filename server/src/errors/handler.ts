import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import type { ApiErrorBody, DomainErrorCode } from "@promptimize/shared";
import { DomainError } from "./domain";
import { ApiError } from "./api";

// map domain error codes to http status codes (layers throw their own error codes)
const statusByCode: Record<DomainErrorCode, ContentfulStatusCode> = {
  VALIDATION_ERROR: 400,
  MODEL_NOT_CONFIGURED: 400,
  NOT_FOUND: 404,
  DUPLICATE_NAME: 409,
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof DomainError) {
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message },
    };
    return c.json(body, statusByCode[err.code]);
  }

  if (err instanceof ApiError) {
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message },
    };
    return c.json(body, err.status);
  }
  if (err instanceof HTTPException) {
    const body: ApiErrorBody = {
      error: {
        code: "HTTP_ERROR",
        message: err.message,
      },
    };
    return c.json(body, err.status);
  }

  console.error(`${c.req.method} ${c.req.path}`, err);

  // default
  const body: ApiErrorBody = {
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  };
  return c.json(body, 500);
};
