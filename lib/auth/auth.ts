// File: src/lib/auth.ts

import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth/auth-options";
import { getEffectivePermissions } from "@/lib/roles";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import {
  countMemberships,
  listMemberships,
  resolveAccess,
  resolveActiveStoreId,
} from "@/lib/store-membership";

export async function auth() {
  return getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireRole(role: UserRole | UserRole[]) {
  const user = await requireAuth();
  const allowed = Array.isArray(role) ? role : [role];

  if (!allowed.includes(user.role as UserRole)) {
    throw new Error("Forbidden");
  }

  return user;
}

export async function hasPermission(permission: string) {
  const user = await requireAuth();

  // Read the role and permissions of the store being acted on, not the ones
  // on the User row: the same person can be an Admin in one shop and Staff
  // in another, and using the User row would give them whichever they
  // happened to be created as, in every store.
  //
  // Resolved here rather than via store-context: that module imports this
  // one, so calling back into it would form a cycle. `store-membership` is
  // deliberately dependency-free for exactly this reason. Falls back to the
  // User row when no membership exists, so single-store behaviour is
  // unchanged.
  const memberships = user.id ? await listMemberships(user.id) : [];
  const cookieStore = await cookies();
  const requested = cookieStore.get("active_store_id")?.value ?? null;
  const total = user.id ? await countMemberships(user.id) : 0;
  const activeStoreId = resolveActiveStoreId(
    user,
    requested,
    memberships,
    total,
  );
  const access = resolveAccess(user, activeStoreId, memberships);

  const permissions = getEffectivePermissions({
    role: access.role,
    permissions: access.permissions,
  });

  return permissions.includes(permission);
}
/**
 * Throwing companion to `hasPermission`, for guarding mutations.
 *
 * Server actions are POST endpoints in their own right: middleware gates them
 * by the pathname they happen to be invoked from, which says nothing about
 * which action is being run. A Staff user who is blocked from /billing can
 * still reach a billing action from any page they are allowed to load, so the
 * check has to live in the action rather than in front of the route.
 */
export async function requirePermission(permission: string) {
  const user = await requireAuth();

  if (!(await hasPermission(permission))) {
    throw new Error("Forbidden");
  }

  return user;
}

/**
 * Permission check against a named store, rather than whichever store the
 * cookie says is active.
 *
 * The two differ in exactly the case this exists for: the QR scan-to-sell
 * path writes to the shop the scanned piece belongs to, which need not be the
 * shop the browser had open. Checking the active store there would let
 * someone who may sell in one shop invoice in another — the membership check
 * alone does not cover it, because being a member of a store is not the same
 * as being allowed to bill in it.
 */
export async function requirePermissionInStore(
  permission: string,
  storeId: string,
) {
  const user = await requireAuth();

  // Super Admin reaches every store and is a member of none, so membership
  // cannot be the test for them.
  if (user.role === UserRole.SUPER_ADMIN) return user;

  const memberships = user.id ? await listMemberships(user.id) : [];
  const membership = memberships.find((entry) => entry.storeId === storeId);

  if (!membership) throw new Error("Forbidden");

  // Role and permissions are read from the membership in *this* store — the
  // same person can be Admin in one shop and restricted Staff in another.
  const permissions = getEffectivePermissions({
    role: membership.role,
    permissions: membership.permissions,
  });

  if (!permissions.includes(permission)) throw new Error("Forbidden");

  return user;
}
