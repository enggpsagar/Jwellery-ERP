/**
 * Plan status, kept out of the server-actions module.
 *
 * `"use server"` files may only export async functions, so a plain type and a
 * pure function cannot live there — and this one is wanted on the client too,
 * for badges, without dragging a server action along with it.
 */

/**
 * Where a store's subscription stands right now.
 *
 * Derived rather than stored: a store does not become "expired" by anyone
 * writing a status, it becomes expired because a date passed. Reading it from
 * the dates means it can never drift out of sync with them.
 */
export type PlanStatus =
  | "ARCHIVED"
  | "NO_PLAN"
  | "EXPIRED"
  | "EXPIRING_SOON"
  | "ACTIVE";

/** Matches the reminder cron's window, so the badge agrees with the emails. */
const EXPIRING_SOON_DAYS = 7;

export function derivePlanStatus(store: {
  isActive: boolean;
  planId: string | null;
  planExpiresAt: Date | null;
}): PlanStatus {
  // Archived wins over everything: nobody can sign in regardless of the plan.
  if (!store.isActive) return "ARCHIVED";
  if (!store.planId || !store.planExpiresAt) return "NO_PLAN";

  const msLeft = store.planExpiresAt.getTime() - Date.now();

  if (msLeft <= 0) return "EXPIRED";
  if (msLeft <= EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) return "EXPIRING_SOON";

  return "ACTIVE";
}

