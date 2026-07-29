// lib/actions/karigar-actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type Karigar = {
  id: string;
  code: string;
  name: string;
  mobile: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  pincode: string;
  gstNumber: string;
  panNumber: string;
  aadhaarNumber: string;
  specialization: string;
  notes: string;
  openingGold: number;
  openingCash: number;
  isActive: boolean;
  createdAt?: string;
};

export type KarigarFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

export type KarigarSortBy = "name" | "code" | "createdAt";
export type SortOrder = "asc" | "desc";

export type GetKarigarsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: KarigarSortBy;
  sortOrder?: SortOrder;
};

export type KarigarListResponse = {
  karigars: Karigar[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

function toNumber(value: FormDataEntryValue | null, fallback = 0) {
  if (value === null || value === "") return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function toOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

function mapKarigar(karigar: any): Karigar {
  return {
    id: karigar.id,
    code: karigar.code ?? "",
    name: karigar.name,
    mobile: karigar.mobile ?? "",
    whatsapp: karigar.whatsapp ?? "",
    email: karigar.email ?? "",
    address: karigar.address ?? "",
    city: karigar.city ?? "",
    pincode: karigar.pincode ?? "",
    gstNumber: karigar.gstNumber ?? "",
    panNumber: karigar.panNumber ?? "",
    aadhaarNumber: karigar.aadhaarNumber ?? "",
    specialization: karigar.specialization ?? "",
    notes: karigar.notes ?? "",
    openingGold: Number(karigar.openingGold),
    openingCash: Number(karigar.openingCash),
    isActive: karigar.isActive,
    createdAt: karigar.createdAt?.toISOString?.() ?? undefined,
  };
}

function getWhere(search?: string) {
  const query = String(search || "").trim();
  if (!query) return {};

  return {
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { code: { contains: query, mode: "insensitive" as const } },
      { mobile: { contains: query, mode: "insensitive" as const } },
    ],
  };
}

function getOrderBy(sortBy: KarigarSortBy = "createdAt", sortOrder: SortOrder = "desc") {
  switch (sortBy) {
    case "name":
      return { name: sortOrder };
    case "code":
      return { code: sortOrder };
    default:
      return { createdAt: sortOrder };
  }
}

export async function getKarigars(
  params: GetKarigarsParams = {},
): Promise<KarigarListResponse> {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const search = String(params.search || "").trim();
  const sortBy = params.sortBy || "createdAt";
  const sortOrder = params.sortOrder || "desc";
  const where = getWhere(search);

  const [totalCount, karigars] = await Promise.all([
    prisma.karigar.count({ where }),
    prisma.karigar.findMany({
      where,
      orderBy: getOrderBy(sortBy, sortOrder),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    karigars: karigars.map(mapKarigar),
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

export async function getKarigarById(id: string): Promise<Karigar | null> {
  const karigar = await prisma.karigar.findUnique({ where: { id } });
  if (!karigar) return null;
  return mapKarigar(karigar);
}

function buildKarigarData(formData: FormData) {
  return {
    code: toOptionalString(formData.get("code")),
    name: String(formData.get("name") || "").trim(),
    mobile: toOptionalString(formData.get("mobile")),
    whatsapp: toOptionalString(formData.get("whatsapp")),
    email: toOptionalString(formData.get("email")),
    address: toOptionalString(formData.get("address")),
    city: toOptionalString(formData.get("city")),
    pincode: toOptionalString(formData.get("pincode")),
    gstNumber: toOptionalString(formData.get("gstNumber")),
    panNumber: toOptionalString(formData.get("panNumber")),
    aadhaarNumber: toOptionalString(formData.get("aadhaarNumber")),
    specialization: toOptionalString(formData.get("specialization")),
    notes: toOptionalString(formData.get("notes")),
    openingGold: toNumber(formData.get("openingGold")),
    openingCash: toNumber(formData.get("openingCash")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  };
}

export async function createKarigar(
  prevState: KarigarFormState,
  formData: FormData,
): Promise<KarigarFormState> {
  try {
    const name = String(formData.get("name") || "").trim();

    if (!name) {
      return {
        success: false,
        message: "Karigar name is required",
        errors: { name: ["Name is required"] },
      };
    }

    const data = buildKarigarData(formData);
    // isActive should default to true on create, not depend on a checkbox being present
    if (formData.get("isActive") === null) data.isActive = true;

    await prisma.karigar.create({ data });
    revalidatePath("/karigars");

    return { success: true, message: "Karigar created successfully" };
  } catch (error: any) {
    if (error.code === "P2002") {
      return {
        success: false,
        message: "Karigar code or mobile already exists",
      };
    }
    console.error("createKarigar error:", error);
    return { success: false, message: "Failed to create karigar" };
  }
}

export async function updateKarigar(
  id: string,
  prevState: KarigarFormState,
  formData: FormData,
): Promise<KarigarFormState> {
  try {
    const name = String(formData.get("name") || "").trim();

    if (!name) {
      return {
        success: false,
        message: "Karigar name is required",
        errors: { name: ["Name is required"] },
      };
    }

    const data = buildKarigarData(formData);

    await prisma.karigar.update({ where: { id }, data });

    revalidatePath("/karigars");
    revalidatePath(`/karigars/${id}`);

    return { success: true, message: "Karigar updated successfully" };
  } catch (error: any) {
    if (error.code === "P2002") {
      return {
        success: false,
        message: "Karigar code or mobile already exists",
      };
    }
    console.error("updateKarigar error:", error);
    return { success: false, message: "Failed to update karigar" };
  }
}

/**
 * Delete karigar only when it has no linked jobs or ledger entries,
 * mirroring the dependency-safe delete pattern used for products.
 */
export async function deleteKarigar(id: string): Promise<KarigarFormState> {
  try {
    const karigar = await prisma.karigar.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        karigarJobs: { select: { id: true }, take: 1 },
        ledgerEntries: { select: { id: true }, take: 1 },
      },
    });

    if (!karigar) {
      return { success: false, message: "Karigar not found" };
    }

    if (karigar.karigarJobs.length > 0 || karigar.ledgerEntries.length > 0) {
      return {
        success: false,
        message:
          "This karigar has jobs or ledger entries linked to them and cannot be deleted. Mark them inactive instead.",
      };
    }

    await prisma.karigar.delete({ where: { id } });
    revalidatePath("/karigars");

    return { success: true, message: "Karigar deleted successfully" };
  } catch (error) {
    console.error("deleteKarigar error:", error);
    return { success: false, message: "Failed to delete karigar" };
  }
}
