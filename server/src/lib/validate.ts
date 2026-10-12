import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import { ApiError } from "../errors.js";

export const validateJson = <T extends ZodType>(schema: T) =>
  zValidator("json", schema, (result) => {
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new ApiError(400, "VALIDATION_ERROR", message);
    }
  });
