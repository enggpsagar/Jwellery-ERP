// lib/actions/store-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { UserRole, UserStatus, InventoryStockStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth/auth";
import { ACTIVE_STORE_COOKIE } from "@/lib/store-context";
import { buildExcelExport } from "@/lib/excel-export";
import { classifyMetalName } from "@/lib/business-units";
import { sendInviteEmailSafely } from "@/lib/invite-email";

export type StoreFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

export type StoreSortBy = "name" | "code" | "createdAt";
export type SortOrder = "asc" | "desc";

export type GetStoresParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: StoreSortBy;
  sortOrder?: SortOrder;
};

export type StoresPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

type ExportStoresParams = {
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
};

const STORE_INCLUDE = {
  _count: {
    select: { users: true, customers: true, invoices: true },
  },
} as const;

function toOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

function getStoresWhere(search?: string) {
  const query = String(search || "").trim();

  if (!query) return {};

  return {
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { code: { contains: query, mode: "insensitive" as const } },
      { city: { contains: query, mode: "insensitive" as const } },
    ],
  };
}

function getStoresOrderBy(sortBy: StoreSortBy = "createdAt", sortOrder: SortOrder = "desc") {
  if (sortBy === "name") return { name: sortOrder };
  if (sortBy === "code") return { code: sortOrder };
  return { createdAt: sortOrder };
}

export async function getStores(params: GetStoresParams = {}) {
  await requireRole(UserRole.SUPER_ADMIN);

  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const search = String(params.search || "").trim();
  const sortBy = params.sortBy || "createdAt";
  const sortOrder = params.sortOrder || "desc";

  const where = getStoresWhere(search);
  const orderBy = getStoresOrderBy(sortBy, sortOrder);

  const [totalCount, stores] = await Promise.all([
    prisma.store.count({ where }),
    prisma.store.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: STORE_INCLUDE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const pagination: StoresPagination = {
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };

  return { stores, pagination };
}

export async function exportStoresToExcel(params: ExportStoresParams = {}): Promise<{
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
}> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const where = getStoresWhere(params.search);
    const orderBy = getStoresOrderBy(
      (params.sortBy as StoreSortBy) || "createdAt",
      params.sortOrder || "desc"
    );

    const stores = await prisma.store.findMany({
      where,
      orderBy,
      include: STORE_INCLUDE,
    });

    if (!stores.length) {
      return { success: false, message: "No stores found to export." };
    }

    const rows = stores.map((store, index) => ({
      "Sr. No.": index + 1,
      "Store Name": store.name,
      Code: store.code,
      City: store.city || "",
      Phone: store.phone || "",
      Email: store.email || "",
      Status: store.isActive ? "Active" : "Inactive",
      Users: store._count.users,
      Customers: store._count.customers,
      Invoices: store._count.invoices,
      "Created At": store.createdAt.toLocaleString("en-IN"),
    }));

    const { fileName, fileBase64 } = buildExcelExport(rows, "Stores", "stores");

    return {
      success: true,
      message: "Stores exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    console.error("exportStoresToExcel error:", error);
    return { success: false, message: "Failed to export stores." };
  }
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
    const phone = toOptionalString(formData.get("phone"));
    const email = toOptionalString(formData.get("email"));
    const adminName = String(formData.get("adminName") || "").trim();
    const adminEmail = toOptionalString(formData.get("adminEmail"));
    const adminPhone = toOptionalString(formData.get("adminPhone"));

    const errors: Record<string, string[]> = {};
    if (!name) errors.name = ["Store name is required"];
    if (!code) errors.code = ["Store code is required"];
    if (!phone) errors.phone = ["Store phone number is required"];
    if (!email) errors.email = ["Store email is required"];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = ["Enter a valid email address"];
    }
    if (!adminName) errors.adminName = ["Admin name is required"];
    if (!adminEmail && !adminPhone) {
      errors.adminEmail = ["Provide an admin email or phone number"];
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    // Email/phone are globally-unique sign-in identifiers across every
    // store — check up front so the error names exactly which field
    // collided, rather than relying on the DB's generic P2002 message.
    if (adminEmail || adminPhone) {
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            adminEmail ? { email: adminEmail } : undefined,
            adminPhone ? { phone: adminPhone } : undefined,
          ].filter((clause): clause is NonNullable<typeof clause> => !!clause),
        },
        select: { email: true, phone: true },
      });

      if (existing) {
        const field = existing.email === adminEmail ? "adminEmail" : "adminPhone";
        return {
          success: false,
          message:
            field === "adminEmail"
              ? "This email is already registered to a user at another store."
              : "This phone number is already registered to a user at another store.",
          errors: { [field]: ["Already in use by another store's user"] },
        };
      }
    }

    const store = await prisma.$transaction(async (tx) => {
      const createdStore = await tx.store.create({
        data: {
          name,
          code,
          address: toOptionalString(formData.get("address")),
          city: toOptionalString(formData.get("city")),
          state: toOptionalString(formData.get("state")),
          pincode: toOptionalString(formData.get("pincode")),
          phone,
          email,
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
          storeId: createdStore.id,
        },
      });

      return createdStore;
    });

    revalidatePath("/stores");

    const emailSent = await sendInviteEmailSafely({
      email: adminEmail,
      phone: adminPhone,
      name: adminName,
      role: UserRole.ADMIN,
      storeName: store.name,
    });

    return {
      success: true,
      message:
        adminEmail && emailSent
          ? `Store "${name}" created and a welcome email was sent to ${adminEmail}`
          : adminEmail
            ? `Store "${name}" created, but the welcome email could not be sent`
            : `Store "${name}" created`,
    };
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

/**
 * Archiving a store marks it inactive (Store.isActive = false) and blocks
 * further sign-in for that store's own ADMIN/STAFF/KARIGAR users (enforced
 * in lib/auth/auth-options.ts's signIn callback and otp-auth.ts) — it does
 * not touch any already-issued session, which stays valid until it expires.
 */
export async function archiveStore(storeId: string): Promise<StoreFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    if (!store) {
      return { success: false, message: "Store not found" };
    }

    await prisma.store.update({
      where: { id: storeId },
      data: { isActive: false },
    });

    revalidatePath("/stores");

    return { success: true, message: `Store "${store.name}" archived` };
  } catch (error) {
    console.error("archiveStore error:", error);
    return { success: false, message: "Failed to archive store" };
  }
}

export async function restoreStore(storeId: string): Promise<StoreFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });

    if (!store) {
      return { success: false, message: "Store not found" };
    }

    await prisma.store.update({
      where: { id: storeId },
      data: { isActive: true },
    });

    revalidatePath("/stores");

    return { success: true, message: `Store "${store.name}" restored` };
  } catch (error) {
    console.error("restoreStore error:", error);
    return { success: false, message: "Failed to restore store" };
  }
}

export type StoreDetail = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gstNumber: string | null;
};

export type PlatformGoldStoreBreakdown = {
  storeId: string;
  storeName: string;
  storeCode: string;
  goldWeight: number;
};

export type PlatformGoldSummary = {
  totalGoldWeight: number;
  byStore: PlatformGoldStoreBreakdown[];
};

/**
 * Physical gold currently IN_STOCK, summed across every store — a
 * platform-wide view only Super Admin can see, since each store's own
 * Dashboard only shows its own stock in isolation.
 */
export async function getPlatformGoldInventory(): Promise<PlatformGoldSummary> {
  await requireRole(UserRole.SUPER_ADMIN);

  const rows = await prisma.inventoryStock.findMany({
    where: { status: InventoryStockStatus.IN_STOCK },
    select: {
      netWeight: true,
      store: { select: { id: true, name: true, code: true } },
      metalType: { select: { name: true } },
    },
  });

  const byStoreMap = new Map<string, PlatformGoldStoreBreakdown>();

  for (const row of rows) {
    if (classifyMetalName(row.metalType?.name) !== "GOLD") continue;

    const weight = Number(row.netWeight ?? 0);
    const existing = byStoreMap.get(row.store.id) ?? {
      storeId: row.store.id,
      storeName: row.store.name,
      storeCode: row.store.code,
      goldWeight: 0,
    };
    existing.goldWeight += weight;
    byStoreMap.set(row.store.id, existing);
  }

  const byStore = Array.from(byStoreMap.values()).sort(
    (a, b) => b.goldWeight - a.goldWeight
  );
  const totalGoldWeight = byStore.reduce((sum, s) => sum + s.goldWeight, 0);

  return { totalGoldWeight, byStore };
}

export async function getStoreById(storeId: string): Promise<StoreDetail | null> {
  await requireRole(UserRole.SUPER_ADMIN);

  return prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstNumber: true,
    },
  });
}

export async function updateStore(
  storeId: string,
  prevState: StoreFormState,
  formData: FormData
): Promise<StoreFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    const name = String(formData.get("name") || "").trim();
    const code = String(formData.get("code") || "").trim().toUpperCase();
    const phone = toOptionalString(formData.get("phone"));
    const email = toOptionalString(formData.get("email"));

    const errors: Record<string, string[]> = {};
    if (!name) errors.name = ["Store name is required"];
    if (!code) errors.code = ["Store code is required"];
    if (!phone) errors.phone = ["Store phone number is required"];
    if (!email) errors.email = ["Store email is required"];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = ["Enter a valid email address"];
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    await prisma.store.update({
      where: { id: storeId },
      data: {
        name,
        code,
        address: toOptionalString(formData.get("address")),
        city: toOptionalString(formData.get("city")),
        state: toOptionalString(formData.get("state")),
        pincode: toOptionalString(formData.get("pincode")),
        phone,
        email,
        gstNumber: toOptionalString(formData.get("gstNumber")),
      },
    });

    revalidatePath("/stores");

    return { success: true, message: `Store "${name}" updated` };
  } catch (error: any) {
    if (error.code === "P2002") {
      return { success: false, message: "A store with that code already exists" };
    }
    console.error("updateStore error:", error);
    return { success: false, message: "Failed to update store" };
  }
}

export async function setActiveStoreAction(storeId: string) {
  // Switching is no longer Super-Admin-only: a person who works across two
  // shops picks between them here too. Membership is what authorises it, so
  // the check is "may this user act on this store", not "is this user a
  // Super Admin" — otherwise the cookie could be pointed at any store.
  const user = await requireAuth();

  if (user.role !== UserRole.SUPER_ADMIN) {
    const membership = await prisma.userStoreMembership.findFirst({
      where: {
        userId: user.id,
        storeId,
        isActive: true,
        store: { isActive: true },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new Error("You do not have access to that store.");
    }
  }

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
  // Anyone may clear their own selection; it only removes a cookie, and
  // resolution falls back to their own membership.
  await requireAuth();

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_STORE_COOKIE);

  revalidatePath("/");
}
