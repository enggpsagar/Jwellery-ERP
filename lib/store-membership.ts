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
  if (user.role === UserRole.SUPER_ADMIN) {
    // Super Admin is a member of nothing and reaches every store, so their
    // choice stands on its own.
    return requestedStoreId;
  }

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
