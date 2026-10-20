export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_NAME"
  | "HTTP_ERROR"
  | "INTERNAL_ERROR"
  | "MODEL_NOT_CONFIGURED";

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
