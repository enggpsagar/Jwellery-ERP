// lib/actions/store-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { UserRole, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ACTIVE_STORE_COOKIE } from "@/lib/store-context";

export type StoreFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

function toOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

export async function getStores() {
  await requireRole(UserRole.SUPER_ADMIN);

  const stores = await prisma.store.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { users: true, customers: true, invoices: true },
      },
    },
  });

  return stores;
}

/**
 * Creates a Store and its initial Admin user in one transaction, so a
 * Super Admin can spin up a new store ready for that Admin to sign in
 * and finish setup (business details, invoice prefixes, etc).
 */
export async function createStoreWithAdmin(
  prevState: StoreFormState,
  formData: FormData
): Promise<StoreFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const name = String(formData.get("name") || "").trim();
    const code = String(formData.get("code") || "").trim().toUpperCase();
    const adminName = String(formData.get("adminName") || "").trim();
    const adminEmail = toOptionalString(formData.get("adminEmail"));
    const adminPhone = toOptionalString(formData.get("adminPhone"));

    const errors: Record<string, string[]> = {};
    if (!name) errors.name = ["Store name is required"];
    if (!code) errors.code = ["Store code is required"];
    if (!adminName) errors.adminName = ["Admin name is required"];
    if (!adminEmail && !adminPhone) {
      errors.adminEmail = ["Provide an admin email or phone number"];
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name,
          code,
          address: toOptionalString(formData.get("address")),
          city: toOptionalString(formData.get("city")),
          state: toOptionalString(formData.get("state")),
          pincode: toOptionalString(formData.get("pincode")),
          phone: toOptionalString(formData.get("phone")),
          email: toOptionalString(formData.get("email")),
          gstNumber: toOptionalString(formData.get("gstNumber")),
        },
      });

      await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          phone: adminPhone,
          role: UserRole.ADMIN,
          status: UserStatus.INVITED,
          isActive: true,
          storeId: store.id,
        },
      });
    });

    revalidatePath("/stores");

    return { success: true, message: `Store "${name}" created` };
  } catch (error: any) {
    if (error.code === "P2002") {
      return {
        success: false,
        message: "A store with that code, or a user with that email/phone, already exists",
      };
    }
    console.error("createStoreWithAdmin error:", error);
    return { success: false, message: "Failed to create store" };
  }
}

export async function setActiveStoreAction(storeId: string) {
  await requireRole(UserRole.SUPER_ADMIN);

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new Error("Store not found");

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/");
}

export async function clearActiveStoreAction() {
  await requireRole(UserRole.SUPER_ADMIN);

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_STORE_COOKIE);

  revalidatePath("/");
}
