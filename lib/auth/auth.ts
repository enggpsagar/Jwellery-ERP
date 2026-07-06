// File: src/lib/auth.ts

import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth/auth-options";
import { ROLE_PERMISSIONS } from "@/lib/roles";

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

export async function requireRole(role: UserRole) {
  const user = await requireAuth();

  if (user.role !== role) {
    throw new Error("Forbidden");
  }

  return user;
}

export async function hasPermission(permission: string) {
  const user = await requireAuth();

  const permissions =
    ROLE_PERMISSIONS[user.role as UserRole] ?? [];

  return permissions.includes(permission);
}