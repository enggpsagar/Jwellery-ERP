import { cookies, headers } from "next/headers";
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

export const EXPIRED_PLAN_MESSAGE =
  "This store's plan has expired. Contact your administrator to renew.";

export type { StoreMembership };

async function requestedStoreId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null;
}

/**
 * The Next.js client runtime marks every Server Action invocation (a form
 * submit, a button's onClick calling a "use server" function) with a
 * `Next-Action` request header — a real framework signal, not a guess, and
 * one a plain page render (a read: Server Components fetching data during
 * SSR) never carries. Lets an expired store's data stay viewable while
 * blocking the thing that's actually a new entry or an update.
 */
async function isMutationRequest(): Promise<boolean> {
  const headerList = await headers();
  return headerList.has("next-action");
}

async function isStorePlanExpired(storeId: string): Promise<boolean> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { planExpiresAt: true },
  });
  return Boolean(store?.planExpiresAt && store.planExpiresAt < new Date());
}

/**
 * Blocks a store-scoped mutation once its plan has expired — applies to
 * everyone acting on the store, Super Admin included (a Super Admin
 * switched into an expired store is still "acting on the store's data",
 * same as its own owner; only the Stores console's own plan-management
 * actions, which never call this, are exempt by construction). Never
 * called for a read: see isMutationRequest's own doc comment.
 *
 * A thrown Error, not redirect() — this must not navigate the caller away
 * from the page they're viewing (that would defeat "still able to view"),
 * and every mutation across this app already wraps its own body in
 * try/catch to turn a thrown error into a {success:false, message} toast.
 */
async function assertPlanActiveForMutation(storeId: string): Promise<void> {
  if (!(await isMutationRequest())) return;
  if (await isStorePlanExpired(storeId)) {
    throw new Error(EXPIRED_PLAN_MESSAGE);
  }
}

/**
 * The export-route equivalent of assertPlanActiveForMutation — unconditional
 * rather than mutation-gated, since a CSV/Excel export is a GET request
 * (a Route Handler, not a Server Action) and so never carries the
 * `Next-Action` header that check relies on, but is still something the
 * confirmed requirement says should stop working on an expired plan (only
 * *viewing* the data in the app itself should keep working). Call at the
 * top of an export route.ts, after resolving storeId the normal way.
 */
export async function assertPlanActiveForExport(storeId: string): Promise<void> {
  if (await isStorePlanExpired(storeId)) {
    throw new Error(EXPIRED_PLAN_MESSAGE);
  }
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

  // Real-time check, not JWT-cached (see assertPlanActiveForMutation's own
  // doc comment for why relying on the session token doesn't work in this
  // app), and only for a mutation — viewing an expired store's existing
  // data stays available, matching the confirmed requirement: view is
  // fine, new entries/updates/exports are not.
  await assertPlanActiveForMutation(storeId);

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

  // Same real-time, mutation-only plan check as requireStoreScope() (see
  // assertPlanActiveForMutation's own doc comment) — this is a genuinely
  // separate code path, not a wrapper around it, when a caller passes an
  // explicit requestedStoreId (e.g. createInvoice's hidden storeId form
  // field): the early `if (!requested) return requireStoreScope()` above
  // only covers the *other* branch. Missing this here is exactly how an
  // expired store could still create invoices after the requireStoreScope()
  // fix shipped — confirmed the hard way, testing found it.
  await assertPlanActiveForMutation(requested);

  return requested;
}
