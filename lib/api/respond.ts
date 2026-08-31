import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ApiKeyAuthError } from "@/lib/auth/api-key";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  fields?: Record<string, string[]>,
) {
  return NextResponse.json({ error: { code, message, fields } }, { status });
}

/** Every `app/api/v1/*` route handler should funnel unexpected throws
 * through this — one place decides how an ApiKeyAuthError, a zod
 * validation failure, or anything else maps to an HTTP response, so the
 * error shape can never drift between routes. */
export function apiErrorFromException(error: unknown) {
  if (error instanceof ApiKeyAuthError) {
    return apiError(
      error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      error.message,
      error.status,
    );
  }

  if (error instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] = [...(fields[key] ?? []), issue.message];
    }
    return apiError("VALIDATION_ERROR", "Invalid request body", 422, fields);
  }

  console.error("API route error:", error);
  return apiError("INTERNAL_ERROR", "Something went wrong", 500);
}
