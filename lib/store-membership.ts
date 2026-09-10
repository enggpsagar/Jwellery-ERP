import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Membership resolution, expressed purely over ids.
 *
 * Deliberately imports neither `auth` nor `store-context`: both of those
 * need this logic, and having it call back into them created a cycle
 * (`store-context` → `auth` → `store-context`) that a bundler can resolve to
 * `undefined` at runtime. Session-aware wrappers live in `store-context`.
 */

export type StoreMembership = {
  storeId: string;
  storeName: string;
  storeCode: string;
  role: UserRole;
  permissions: string[];
};

export type MembershipUser = {
  id?: string;
  role?: string | null;
  storeId?: string | null;
  permissions?: string[] | null;
};

/**
 * Stores this user may act on.
 *
 * Only active memberships in active stores count: a store that deactivates
 * someone has released them, and their data must become unreachable at once
 * rather than at next sign-in.
 */
export async function countMemberships(userId: string): Promise<number> {
  return prisma.userStoreMembership.count({ where: { userId } });
}

export async function listMemberships(
  userId: string,
): Promise<StoreMembership[]> {
  const rows = await prisma.userStoreMembership.findMany({
    where: { userId, isActive: true, store: { isActive: true } },
    orderBy: { store: { name: "asc" } },
    select: {
      storeId: true,
      role: true,
      permissions: true,
      store: { select: { name: true, code: true } },
    },
  });

  return rows.map((row) => ({
    storeId: row.storeId,
    storeName: row.store.name,
    storeCode: row.store.code,
    role: row.role,
    permissions: row.permissions ?? [],
  }));
}

/**
 * A SUPER_ADMIN's equivalent of `listMemberships` — the stores whose
 * Collaboration Code they've redeemed AND whose code hasn't since been
 * regenerated (see Store.collaborationCode's own doc comment). Shaped
 * identically to StoreMembership so `resolveActiveStoreId`/`resolveAccess`
 * apply the exact same logic to a SUPER_ADMIN as to anyone else — the only
 * difference is which table backs the list.
 */
export async function listCollaborationGrants(
  superAdminUserId: string,
): Promise<StoreMembership[]> {
  const rows = await prisma.storeCollaborationAccess.findMany({
    where: {
      superAdminUserId,
      store: { isActive: true },
    },
    orderBy: { store: { name: "asc" } },
    select: {
      storeId: true,
      grantedCodeVersion: true,
      store: { select: { name: true, code: true, collaborationCodeVersion: true } },
    },
  });

  return rows
    .filter((row) => row.grantedCodeVersion === row.store.collaborationCodeVersion)
    .map((row) => ({
      storeId: row.storeId,
      storeName: row.store.name,
      storeCode: row.store.code,
      role: UserRole.SUPER_ADMIN,
      permissions: [],
    }));
}

/** Every redemption row this Super Admin has ever made, live or since
 * retired by a code regeneration — mirrors `countMemberships`' role in
 * distinguishing "never redeemed anything" from "redeemed, then revoked." */
export async function countCollaborationGrants(
  superAdminUserId: string,
): Promise<number> {
  return prisma.storeCollaborationAccess.count({ where: { superAdminUserId } });
}

/**
 * Which store a request acts on, given the user and whatever the
 * `active_store_id` cookie asked for.
 *
 * The cookie is only honoured when it names a store the user is actually a
 * member of, so editing it by hand cannot reach another store's data.
 */
export function resolveActiveStoreId(
  user: MembershipUser,
  requestedStoreId: string | null,
  memberships: StoreMembership[],
  /**
   * Total membership rows for this user, active or not. Distinguishes "this
   * account predates the table" from "every membership was deactivated" —
   * without it, revoking someone's only membership would fall back to
   * `User.storeId` and hand their access straight back.
   */
  totalMembershipRows?: number,
): string | null {
  // No SUPER_ADMIN bypass of the membership LIST here — Store Owner
  // Authorization means a Super Admin reaches only the stores they've
  // redeemed a Collaboration Code for, exactly like anyone else's
  // memberships (see getUserStoreMemberships in store-context.ts, which
  // sources `memberships` from `listCollaborationGrants` for them). But a
  // Super Admin DOES still get one thing no regular member does: the
  // ability to deliberately request no store at all (StoreSwitcher's "All
  // Stores (Global View)" item, which clears the cookie) and have that
  // stick — see the dedicated branch below, after the ordinary
  // validate-against-the-list check.
  if (memberships.length === 0) {
    // Rows exist but none are usable — every store has deactivated them.
    // That is a revocation, so it must resolve to nothing rather than
    // falling back to the column and restoring what was taken away.
    if ((totalMembershipRows ?? 0) > 0) return null;

    // Genuinely no rows: an account predating this table, or created outside
    // createUser. Fall back to the column so nothing breaks.
    return user.storeId ?? null;
  }

  if (
    requestedStoreId &&
    memberships.some((m) => m.storeId === requestedStoreId)
  ) {
    return requestedStoreId;
  }

  // A blank cookie from a Super Admin is a deliberate "Global View" choice,
  // not a stale/invalid one — unlike a regular multi-store member (who has
  // nothing useful to do with "no store" and must always land somewhere
  // real), every platform-level page a Super Admin needs without a store
  // (Platform Stores console, Plans, Profile, Support Tickets — see
  // (dashboard)/layout.tsx's STORE_EXEMPT_PREFIXES) already works fine with
  // activeStoreId: null, and any store-scoped action they do reach in that
  // state already fails soft via requireStoreScope()'s own friendly error.
  // Silently overriding that choice back onto a real store (as the
  // fallback below would) made the "All Stores" option in StoreSwitcher a
  // no-op the moment a Super Admin held at least one Collaboration grant.
  if (user.role === UserRole.SUPER_ADMIN && !requestedStoreId) {
    return null;
  }

  // Land somewhere valid rather than throwing "no store selected": their own
  // store if it is one of their memberships, else the first alphabetically.
  const own = memberships.find((m) => m.storeId === user.storeId);
  return own?.storeId ?? memberships[0].storeId;
}

/**
 * Role and module permissions for the store being acted on. The same person
 * can be an Admin in one shop and Staff in another, so this must come from
 * the membership rather than the `User` row.
 */
export function resolveAccess(
  user: MembershipUser,
  activeStoreId: string | null,
  memberships: StoreMembership[],
): { role: UserRole; permissions: string[] } {
  if (user.role === UserRole.SUPER_ADMIN) {
    return { role: UserRole.SUPER_ADMIN, permissions: [] };
  }

  const active = memberships.find((m) => m.storeId === activeStoreId);

  if (active) {
    return { role: active.role, permissions: active.permissions };
  }

  return {
    role: (user.role as UserRole) ?? UserRole.STAFF,
    permissions: user.permissions ?? [],
  };
}
