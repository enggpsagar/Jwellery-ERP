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
} from "@/lib/user";

import { requireAuth, hasPermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { requireStoreScope } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { inviteUserEmail } from "@/lib/email-templates";

export type UserActionState = {
  success: boolean;
  message: string;
};

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

/**
 * Best-effort welcome email for a newly created user — never throws,
 * since a failed/skipped send shouldn't undo the user that was just created.
 */
async function sendInviteEmailSafely(params: {
  email: string | null;
  phone: string | null;
  name: string;
  role: UserRole;
  storeId: string;
}): Promise<boolean> {
  if (!params.email) return false;

  try {
    const settings = await prisma.businessSettings.findUnique({
      where: { storeId: params.storeId },
      select: { businessName: true },
    });

    const storeName = settings?.businessName || "your store";
    const loginUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/login`;

    const { subject, html } = inviteUserEmail({
      name: params.name,
      roleLabel: ROLE_LABELS[params.role],
      storeName,
      hasEmailLogin: true,
      hasPhoneLogin: !!params.phone,
      loginUrl,
    });

    const result = await sendMail({ to: params.email, subject, html });
    return result.sent;
  } catch (error) {
    console.error("sendInviteEmailSafely error:", error);
    return false;
  }
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
    });

    assertNoPrivilegeEscalation(currentUser.role as UserRole, payload.role);

    const storeId = await requireStoreScope();
    await createUser(payload, storeId);

    revalidatePath("/users");

    const emailSent = await sendInviteEmailSafely({
      email: payload.email || null,
      phone: payload.phone || null,
      name: payload.name,
      role: payload.role,
      storeId,
    });

    return {
      success: true,
      message:
        payload.email && emailSent
          ? "User created and invite email sent"
          : payload.email
            ? "User created, but the invite email could not be sent"
            : "User created successfully",
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
