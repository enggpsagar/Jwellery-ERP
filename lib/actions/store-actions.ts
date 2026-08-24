// lib/actions/store-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { UserRole, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/auth";
import { ACTIVE_STORE_COOKIE } from "@/lib/store-context";
import { buildExcelExport } from "@/lib/excel-export";

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
