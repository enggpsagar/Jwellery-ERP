import { cookies } from "next/headers";
import { UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth/auth";
import {
  countMemberships,
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
 * Stores the signed-in user may act on. Empty for a Super Admin — they are a
 * member of nothing and instead reach every store, so callers handle that
 * case separately.
 */
export async function getUserStoreMemberships(): Promise<StoreMembership[]> {
  const user = await getCurrentUser();
  if (!user?.id || user.role === UserRole.SUPER_ADMIN) return [];
  return listMemberships(user.id);
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
  const total =
    user.id && user.role !== "SUPER_ADMIN"
      ? await countMemberships(user.id)
      : 0;

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
    throw new Error(
      "No store selected. Choose a store from the switcher before continuing."
    );
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
  const total =
    user.id && user.role !== "SUPER_ADMIN"
      ? await countMemberships(user.id)
      : 0;
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
