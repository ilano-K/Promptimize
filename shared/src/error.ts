export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_NAME"
  | "HTTP_ERROR"
  | "INTERNAL_ERROR"
  | "MODEL_NOT_CONFIGURED"
  | "MISSING_BASE_URL"
  | "AI_INVALID_OUTPUT"
  | "AI_INCOMPLETE_OUTPUT";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};

export type DomainErrorCode = Exclude<
  ApiErrorCode,
  "HTTP_ERROR" | "INTERNAL_ERROR"
>;
