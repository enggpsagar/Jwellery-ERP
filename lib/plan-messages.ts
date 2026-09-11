// File: lib/plan-messages.ts
//
// Deliberately has zero server-only imports (no next/headers, no prisma) so
// both the server side (lib/store-context.ts, which throws PlanExpiredError
// with this text) and the client side (components/providers/toast-provider.tsx,
// which pattern-matches on this exact string to attach an "Upgrade Plan"
// link to the toast) can import it without lib/store-context.ts's
// server-only dependencies leaking into a "use client" file.

export const EXPIRED_PLAN_MESSAGE =
  "Your plan has expired. Please upgrade your plan to proceed further.";

export const UPGRADE_PLAN_HREF = "/my-plan";
