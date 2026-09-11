// File: lib/action-error.ts

import { PlanExpiredError } from "@/lib/store-context";

/**
 * What a Server Action's catch block should return as `message`, instead of
 * hardcoding its own generic string. A PlanExpiredError is deliberately
 * thrown to be shown to the user verbatim (the toast UI attaches an Upgrade
 * Plan link when it recognizes the exact text — see EXPIRED_PLAN_MESSAGE in
 * lib/plan-messages.ts); any other error keeps using the caller's fallback,
 * since a raw DB/network failure shouldn't leak its detail to the user.
 */
export function actionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof PlanExpiredError) return error.message;
  return fallback;
}
