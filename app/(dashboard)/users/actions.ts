// File: src/app/(dashboard)/users/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import {
  createUserSchema,
  updateUserSchema,
} from "@/lib/validation/user";

import {
  createUser,
  updateUser,
  disableUser,
  enableUser,
  deleteUser,
} from "@/lib/user";

import { requireAuth, hasPermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { requireStoreScope } from "@/lib/store-context";

function assertNoPrivilegeEscalation(
  actingRole: UserRole,
  targetRole: UserRole
) {
  if (targetRole === UserRole.SUPER_ADMIN && actingRole !== UserRole.SUPER_ADMIN) {
    throw new Error("Only a Super Admin can assign the Super Admin role.");
  }
}

export async function createUserAction(formData: FormData) {
  const currentUser = await requireAuth();

  const allowed = await hasPermission(PERMISSIONS.USER_CREATE);

  if (!allowed) {
    throw new Error("You don't have permission to create users.");
  }

  const payload = createUserSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    role: formData.get("role") as UserRole,
    isActive: formData.get("isActive") === "true",
    karigarId: formData.get("karigarId"),
  });

  assertNoPrivilegeEscalation(currentUser.role as UserRole, payload.role);

  const storeId = await requireStoreScope();
  await createUser(payload, storeId);

  revalidatePath("/users");
}

export async function updateUserAction(formData: FormData) {
  const currentUser = await requireAuth();

  const allowed = await hasPermission(PERMISSIONS.USER_UPDATE);

  if (!allowed) {
    throw new Error("You don't have permission to update users.");
  }

  const payload = updateUserSchema.parse({
    id: formData.get("id"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    role: formData.get("role") as UserRole,
    isActive: formData.get("isActive") === "true",
    karigarId: formData.get("karigarId"),
  });

  assertNoPrivilegeEscalation(currentUser.role as UserRole, payload.role);

  const storeId = await requireStoreScope();
  await updateUser(payload, storeId);

  revalidatePath("/users");
}

export async function disableUserAction(id: string) {
  await requireAuth();

  const allowed = await hasPermission(PERMISSIONS.USER_UPDATE);

  if (!allowed) {
    throw new Error("You don't have permission to disable users.");
  }

  const storeId = await requireStoreScope();
  await disableUser(id, storeId);

  revalidatePath("/users");
}

export async function enableUserAction(id: string) {
  await requireAuth();

  const allowed = await hasPermission(PERMISSIONS.USER_UPDATE);

  if (!allowed) {
    throw new Error("You don't have permission to enable users.");
  }

  const storeId = await requireStoreScope();
  await enableUser(id, storeId);

  revalidatePath("/users");
}

export async function deleteUserAction(id: string) {
  await requireAuth();

  const allowed = await hasPermission(PERMISSIONS.USER_DELETE);

  if (!allowed) {
    throw new Error("You don't have permission to delete users.");
  }

  const storeId = await requireStoreScope();
  await deleteUser(id, storeId);

  revalidatePath("/users");
}
