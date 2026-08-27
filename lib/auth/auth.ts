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