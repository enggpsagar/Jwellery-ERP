// File: src/app/(dashboard)/users/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { Prisma, UserRole } from "@prisma/client";

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
  getAllUsersForExport,
  type UserSortBy,
  type SortOrder,
} from "@/lib/user";

import { requireAuth, hasPermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { requireStoreScope, getEffectiveStoreId } from "@/lib/store-context";
import { sendInviteEmailSafely, resolveStoreName } from "@/lib/invite-email";
import { buildExcelExport } from "@/lib/excel-export";

export type UserActionState = {
  success: boolean;
  message: string;
};

function parseJsonStringArrayField(formData: FormData, field: string): string[] {
  const raw = formData.get(field);
  if (typeof raw !== "string" || !raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parsePermissionsField(formData: FormData): string[] {
  return parseJsonStringArrayField(formData, "permissions");
}

function parseLocationIdsField(formData: FormData): string[] {
  return parseJsonStringArrayField(formData, "locationIds");
}

function assertNoPrivilegeEscalation(
  actingRole: UserRole,
  targetRole: UserRole
) {
  if (targetRole === UserRole.SUPER_ADMIN && actingRole !== UserRole.SUPER_ADMIN) {
    throw new Error("Only a Super Admin can assign the Super Admin role.");
  }
}

/**
 * Prisma throws a raw, technical message on a unique-constraint violation,
 * and Next.js redacts thrown Server Action errors down to a generic
 * "Server Components render" message in production — so duplicate
 * email/phone/karigar errors must be caught and translated here rather
 * than allowed to bubble up as a thrown Error.
 */
function friendlyUserErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target)
      ? (error.meta!.target as string[]).join(", ")
      : String(error.meta?.target ?? "");

    if (target.includes("email")) return "A user with this email already exists.";
    if (target.includes("phone")) return "A user with this phone number already exists.";
    if (target.includes("karigarId")) return "This karigar is already linked to another user.";
    return "A user with these details already exists.";
  }

  if (error instanceof Error) return error.message;

  return fallback;
}

export async function createUserAction(
  formData: FormData
): Promise<UserActionState> {
  try {
    const currentUser = await requireAuth();

    const allowed = await hasPermission(PERMISSIONS.USER_CREATE);

    if (!allowed) {
      return { success: false, message: "You don't have permission to create users." };
    }

    const payload = createUserSchema.parse({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      role: formData.get("role") as UserRole,
      isActive: formData.get("isActive") === "true",
      karigarId: formData.get("karigarId"),
      permissions: parsePermissionsField(formData),
      locationIds: parseLocationIdsField(formData),
    });

    assertNoPrivilegeEscalation(currentUser.role as UserRole, payload.role);

    const storeId = await requireStoreScope();
    const { claimed } = await createUser(payload, storeId);

    revalidatePath("/users");

    const emailSent = await sendInviteEmailSafely({
      email: payload.email || null,
      phone: payload.phone || null,
      name: payload.name,
      role: payload.role,
      storeName: await resolveStoreName(storeId),
    });

    const action = claimed ? "linked to this store" : "created";

    return {
      success: true,
      message:
        payload.email && emailSent
          ? `User ${action} and invite email sent`
          : payload.email
            ? `User ${action}, but the invite email could not be sent`
            : `User ${action} successfully`,
    };
  } catch (error) {
    console.error("createUserAction error:", error);
    return { success: false, message: friendlyUserErrorMessage(error, "Failed to create user") };
  }
}

export async function updateUserAction(
  formData: FormData
): Promise<UserActionState> {
  try {
    const currentUser = await requireAuth();

    const allowed = await hasPermission(PERMISSIONS.USER_UPDATE);

    if (!allowed) {
      return { success: false, message: "You don't have permission to update users." };
    }

    const payload = updateUserSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      role: formData.get("role") as UserRole,
      isActive: formData.get("isActive") === "true",
      karigarId: formData.get("karigarId"),
      permissions: parsePermissionsField(formData),
      locationIds: parseLocationIdsField(formData),
    });

    assertNoPrivilegeEscalation(currentUser.role as UserRole, payload.role);

    const storeId = await requireStoreScope();
    await updateUser(payload, storeId);

    revalidatePath("/users");

    return { success: true, message: "User updated successfully" };
  } catch (error) {
    console.error("updateUserAction error:", error);
    return { success: false, message: friendlyUserErrorMessage(error, "Failed to update user") };
  }
}

export async function disableUserAction(id: string): Promise<UserActionState> {
  try {
    await requireAuth();

    const allowed = await hasPermission(PERMISSIONS.USER_UPDATE);

    if (!allowed) {
      return { success: false, message: "You don't have permission to disable users." };
    }

    const storeId = await requireStoreScope();
    await disableUser(id, storeId);

    revalidatePath("/users");

    return { success: true, message: "User disabled" };
  } catch (error) {
    console.error("disableUserAction error:", error);
    return { success: false, message: friendlyUserErrorMessage(error, "Failed to disable user") };
  }
}

export async function enableUserAction(id: string): Promise<UserActionState> {
  try {
    await requireAuth();

    const allowed = await hasPermission(PERMISSIONS.USER_UPDATE);

    if (!allowed) {
      return { success: false, message: "You don't have permission to enable users." };
    }

    const storeId = await requireStoreScope();
    await enableUser(id, storeId);

    revalidatePath("/users");

    return { success: true, message: "User enabled" };
  } catch (error) {
    console.error("enableUserAction error:", error);
    return { success: false, message: friendlyUserErrorMessage(error, "Failed to enable user") };
  }
}

export type ExportUsersParams = {
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
};

export async function exportUsersToExcel(params: ExportUsersParams = {}): Promise<{
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
}> {
  try {
    await requireAuth();

    const allowed = await hasPermission(PERMISSIONS.USER_VIEW);
    if (!allowed) {
      return { success: false, message: "You don't have permission to export users." };
    }

    const storeId = await getEffectiveStoreId();
    const users = await getAllUsersForExport(storeId, {
      search: params.search,
      sortBy: params.sortBy as UserSortBy,
      sortOrder: params.sortOrder,
    });

    if (!users.length) {
      return { success: false, message: "No users found to export." };
    }

    const rows = users.map((user, index) => ({
      "Sr. No.": index + 1,
      Name: user.name ?? "",
      Email: user.email ?? "",
      Phone: user.phone ?? "",
      Role: ROLE_LABELS[user.role] ?? user.role,
      Status: user.status,
      Store: user.store?.name ?? "",
      "Created At": new Date(user.createdAt).toLocaleString("en-IN"),
    }));

    const { fileName, fileBase64 } = buildExcelExport(rows, "Users", "users");

    return {
      success: true,
      message: "Users exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    console.error("exportUsersToExcel error:", error);
    return { success: false, message: "Failed to export users." };
  }
}

export async function deleteUserAction(id: string): Promise<UserActionState> {
  try {
    await requireAuth();

    const allowed = await hasPermission(PERMISSIONS.USER_DELETE);

    if (!allowed) {
      return { success: false, message: "You don't have permission to delete users." };
    }

    const storeId = await requireStoreScope();
    await deleteUser(id, storeId);

    revalidatePath("/users");

    return { success: true, message: "User deleted" };
  } catch (error) {
    console.error("deleteUserAction error:", error);
    return { success: false, message: friendlyUserErrorMessage(error, "Failed to delete user") };
  }
}
