"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/auth";
import { MODULE_DEFINITIONS, type ModuleKey } from "@/lib/roles";

export type MembershipRow = {
  storeId: string;
  storeName: string;
  storeCode: string;
  role: UserRole;
  isActive: boolean;
  moduleKeys: ModuleKey[];
  /** False when the user holds no membership in this store at all. */
  granted: boolean;
};

export type MembershipActionState = {
  success: boolean;
  message: string;
};

/**
 * Granting access to a store is a Super Admin action.
 *
 * A store's own Admin manages people inside their store through the user
 * form; letting them tick other stores would let one shop write itself into
 * another shop's data. Only someone who oversees every store can decide that
 * a person works in two of them.
 */
async function requireSuperAdmin() {
  const user = await requireAuth();

  if (user.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Only a Super Admin can change which stores a user works in.");
  }

  return user;
}

/** Every active store, marked with whether this user has access to it. */
export async function getUserStoreAccess(userId: string): Promise<MembershipRow[]> {
  await requireSuperAdmin();

  const [stores, memberships] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.userStoreMembership.findMany({
      where: { userId },
      select: { storeId: true, role: true, isActive: true, permissions: true },
    }),
  ]);

  const byStore = new Map(memberships.map((m) => [m.storeId, m]));

  return stores.map((store) => {
    const membership = byStore.get(store.id);

    return {
      storeId: store.id,
      storeName: store.name,
      storeCode: store.code,
      role: membership?.role ?? UserRole.STAFF,
      isActive: membership?.isActive ?? false,
      granted: Boolean(membership),
      // Permissions are stored as flat strings; the form works in modules, so
      // translate back the same way the user form does — a module counts as
      // on only when every one of its permissions is present.
      moduleKeys: membership
        ? MODULE_DEFINITIONS.filter((module) =>
            module.permissions.every((permission) =>
              (membership.permissions ?? []).includes(permission),
            ),
          ).map((module) => module.key)
        : [],
    };
  });
}

export type SaveMembershipInput = {
  userId: string;
  storeId: string;
  role: UserRole;
  isActive: boolean;
  moduleKeys: ModuleKey[];
};

/** Grant a store, or change the role/modules the user holds there. */
export async function saveUserStoreAccess(
  input: SaveMembershipInput,
): Promise<MembershipActionState> {
  try {
    await requireSuperAdmin();

    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, role: true },
    });

    if (!target) return { success: false, message: "User not found." };

    if (target.role === UserRole.SUPER_ADMIN) {
      // A Super Admin already reaches every store and belongs to none.
      // Giving them a membership would pin them to one.
      return {
        success: false,
        message: "A Super Admin already has access to every store.",
      };
    }

    const store = await prisma.store.findUnique({
      where: { id: input.storeId },
      select: { id: true },
    });

    if (!store) return { success: false, message: "Store not found." };

    // Only Staff carry module permissions; every other role's access comes
    // from its fixed bundle, so storing a list for them would be misleading.
    const permissions =
      input.role === UserRole.STAFF
        ? MODULE_DEFINITIONS.filter((module) =>
            input.moduleKeys.includes(module.key),
          ).flatMap((module) => module.permissions)
        : [];

    await prisma.userStoreMembership.upsert({
      where: {
        userId_storeId: { userId: input.userId, storeId: input.storeId },
      },
      update: { role: input.role, isActive: input.isActive, permissions },
      create: {
        userId: input.userId,
        storeId: input.storeId,
        role: input.role,
        isActive: input.isActive,
        permissions,
      },
    });

    revalidatePath(`/users/${input.userId}/edit`);
    revalidatePath("/users");

    return { success: true, message: "Store access updated." };
  } catch (error) {
    console.error("saveUserStoreAccess error:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to update store access.",
    };
  }
}

/**
 * Remove a store from a user.
 *
 * Deletes the row rather than deactivating it: a deactivated membership still
 * counts as "this account has membership rows", which is what stops store
 * resolution falling back to `User.storeId`. Leaving a tombstone would be the
 * same as revoking, but harder to read in the UI.
 */
export async function removeUserStoreAccess(
  userId: string,
  storeId: string,
): Promise<MembershipActionState> {
  try {
    await requireSuperAdmin();

    await prisma.userStoreMembership.deleteMany({ where: { userId, storeId } });

    revalidatePath(`/users/${userId}/edit`);
    revalidatePath("/users");

    return { success: true, message: "Store access removed." };
  } catch (error) {
    console.error("removeUserStoreAccess error:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to remove store access.",
    };
  }
}
