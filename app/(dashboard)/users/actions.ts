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
import { PERMISSIONS } from "@/lib/auth/permissions";

export async function createUserAction(formData: FormData) {
  await requireAuth();

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
  });

  await createUser(payload);

  revalidatePath("/users");
}

export async function updateUserAction(formData: FormData) {
  await requireAuth();

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
  });

  await updateUser(payload);

  revalidatePath("/users");
}

export async function disableUserAction(id: string) {
  await requireAuth();

  const allowed = await hasPermission(PERMISSIONS.USER_UPDATE);

  if (!allowed) {
    throw new Error("You don't have permission to disable users.");
  }

  await disableUser(id);

  revalidatePath("/users");
}

export async function enableUserAction(id: string) {
  await requireAuth();

  const allowed = await hasPermission(PERMISSIONS.USER_UPDATE);

  if (!allowed) {
    throw new Error("You don't have permission to enable users.");
  }

  await enableUser(id);

  revalidatePath("/users");
}

export async function deleteUserAction(id: string) {
  await requireAuth();

  const allowed = await hasPermission(PERMISSIONS.USER_DELETE);

  if (!allowed) {
    throw new Error("You don't have permission to delete users.");
  }

  await deleteUser(id);

  revalidatePath("/users");
}