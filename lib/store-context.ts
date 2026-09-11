import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  countCollaborationGrants,
  countMemberships,
  listCollaborationGrants,
  listMemberships,
  resolveAccess,
  resolveActiveStoreId,
  type StoreMembership,
} from "@/lib/store-membership";

export const ACTIVE_STORE_COOKIE = "active_store_id";

export type { StoreMembership };

async function requestedStoreId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null;
}

/**
 * Stores the signed-in user may act on. For a SUPER_ADMIN this is the set
 * of stores whose Collaboration Code they've redeemed (Store Owner
 * Authorization) — see listCollaborationGrants — never every store in the
 * system, unlike the old unconditional-access model.
 */
export async function getUserStoreMemberships(): Promise<StoreMembership[]> {
  const user = await getCurrentUser();
  if (!user?.id) return [];
  if (user.role === UserRole.SUPER_ADMIN) return listCollaborationGrants(user.id);
  return listMemberships(user.id);
}

async function totalMembershipRowsFor(user: { id?: string; role?: string | null }): Promise<number> {
  if (!user.id) return 0;
  return user.role === UserRole.SUPER_ADMIN
    ? countCollaborationGrants(user.id)
    : countMemberships(user.id);
}

/**
 * The store this request is scoped to.
 *
 * A user with one membership resolves to it directly, exactly as before this
 * table existed. With several, the `active_store_id` cookie picks between
 * them — honoured only if it names a store they are really a member of.
 */
export async function getEffectiveStoreId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await getUserStoreMemberships();

  // The row count separates "predates this table" from "all revoked"; only
  // the former may fall back to User.storeId.
  const total = await totalMembershipRowsFor(user);

  return resolveActiveStoreId(
    user,
    await requestedStoreId(),
    memberships,
    total,
  );
}

export async function requireStoreScope(): Promise<string> {
  const storeId = await getEffectiveStoreId();

  if (!storeId) {
    // Deliberately a redirect(), not a thrown Error: a store-scoped page's
    // render (e.g. /reports's Promise.all of report-actions.ts getters)
    // ends up calling this deep inside its OWN data-fetching, which
    // app/(dashboard)/layout.tsx's SelectStoreNotice branch cannot actually
    // prevent — Next.js's App Router renders a page segment's data
    // fetching independently of whether the parent layout's returned JSX
    // ends up referencing {children}, so a plain thrown Error here still
    // reaches the user as the generic "Something went wrong" crash screen
    // (confirmed via production logs: /reports crashed this way for a
    // Super Admin in "All Stores (Global)" view, despite layout.tsx's own
    // guard appearing to cover it). redirect() is the one signal Next.js's
    // router does intercept regardless of render depth, so this fixes
    // every caller across the app in one place, not just /reports.
    // /stores is always reachable for a Super Admin (the intended way to
    // fix this); for a non-Super-Admin (who should never actually hit this
    // — they always have a real storeId — but might via some edge case),
    // middleware's own SUPER_ADMIN-only gate on /stores bounces them
    // onward to /dashboard, which works for them since they have a store.
    redirect("/stores");
  }

  // Real-time check, not JWT-cached: this app's SessionProvider disables
  // both refetchOnWindowFocus and refetchInterval
  // (components/providers/session-provider.tsx), so a session's JWT
  // cookie is effectively frozen at whatever it was signed with at
  // login, for the entire session. Confirmed the hard way — testing found
  // an already-signed-in session could keep creating invoices/purchases
  // indefinitely after its store's plan expired, because
  // middleware.ts's token-based check never actually saw an updated
  // planExpired claim; nothing ever re-signs the cookie to carry one. A
  // direct query here is what actually catches this, on every
  // store-scoped mutation, rather than depending on whatever incidentally
  // refreshes the cookie. Never applies to a Super Admin, who isn't tied
  // to any one store's plan.
  const user = await getCurrentUser();
  if (user?.role !== UserRole.SUPER_ADMIN) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { planExpiresAt: true },
    });
    if (store?.planExpiresAt && store.planExpiresAt < new Date()) {
      redirect("/login?error=plan_expired");
    }
  }

  return storeId;
}

/** Role and permissions that apply in the store currently being acted on. */
export async function getEffectiveAccess(): Promise<{
  role: UserRole;
  permissions: string[];
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await getUserStoreMemberships();
  const total = await totalMembershipRowsFor(user);
  const activeStoreId = resolveActiveStoreId(
    user,
    await requestedStoreId(),
    memberships,
    total,
  );

  return resolveAccess(user, activeStoreId, memberships);
}

export async function isSuperAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === UserRole.SUPER_ADMIN;
}

/**
 * The store an action should write to, when the caller names one explicitly.
 *
 * Exists for flows that must not depend on — or disturb — the active store
 * cookie: the QR scan-to-sell path resolves its store from the scanned piece
 * and carries it in a signed token, so the person scanning keeps whatever
 * store they were already working in.
 *
 * The requested id is never taken on trust. It is honoured only if the user
 * really is a member of that store, which is the same check the store
 * switcher makes — so passing another shop's id gets you exactly as far as
 * asking to switch to it would, which is nowhere.
 */
export async function resolveActingStoreId(
  requestedStoreId?: string | null,
): Promise<string> {
  const requested = (requestedStoreId ?? "").trim();

  // Nothing asked for: behave exactly as before.
  if (!requested) return requireStoreScope();

  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // No SUPER_ADMIN bypass here anymore — Store Owner Authorization means a
  // Super Admin needs a redeemed Collaboration Code for `requested` too;
  // getUserStoreMemberships() already returns that grant list for them, so
  // the same check below applies uniformly.
  const memberships = await getUserStoreMemberships();

  if (!memberships.some((membership) => membership.storeId === requested)) {
    throw new Error("You do not have access to that store.");
  }

  return requested;
}
