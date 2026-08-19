import { cookies } from "next/headers";
import { UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth/auth";

export const ACTIVE_STORE_COOKIE = "active_store_id";

/**
 * The store the current request should be scoped to.
 * ADMIN/STAFF/KARIGAR are always locked to their own store.
 * SUPER_ADMIN has no store of their own — they operate on whichever
 * store they've picked via the store switcher (active_store_id cookie).
 */
export async function getEffectiveStoreId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  if (user.role === UserRole.SUPER_ADMIN) {
    const cookieStore = await cookies();
    return cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null;
  }

  return user.storeId ?? null;
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

export async function isSuperAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === UserRole.SUPER_ADMIN;
}
