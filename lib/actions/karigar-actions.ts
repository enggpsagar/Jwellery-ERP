// FILE PATH: lib/actions/karigar-actions.ts
// REPLACES the entire existing file at this path
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireStoreScope } from "@/lib/store-context";
import * as XLSX from "xlsx";

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

export type ExportKarigarsParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: KarigarSortBy;
  sortOrder?: SortOrder;
};

export type ExportResult = {
  success: boolean;
  message: string;
  fileBase64?: string;
  fileName?: string;
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

function getWhere(storeId: string, search?: string) {
  const query = String(search || "").trim();
  if (!query) return { storeId };

  return {
    storeId,
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
  const storeId = await requireStoreScope();
  const where = getWhere(storeId, search);

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
  const storeId = await requireStoreScope();
  const karigar = await prisma.karigar.findFirst({ where: { id, storeId } });
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

    const storeId = await requireStoreScope();
    await prisma.karigar.create({ data: { ...data, storeId } });
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

    const storeId = await requireStoreScope();
    const { count } = await prisma.karigar.updateMany({ where: { id, storeId }, data });

    if (count === 0) {
      return { success: false, message: "Karigar not found" };
    }

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
    const storeId = await requireStoreScope();
    const karigar = await prisma.karigar.findFirst({
      where: { id, storeId },
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

function formatCurrencyINR(value: number) {
  return `₹ ${value.toLocaleString("en-IN")}`;
}

function formatDateIST(date?: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getKarigarExportFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `karigars-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.xlsx`;
}

export async function exportKarigarsToExcel(
  params: ExportKarigarsParams,
): Promise<ExportResult> {
  try {
    const { selectedIds, search, sortBy = "createdAt", sortOrder = "desc" } = params;

    const storeId = await requireStoreScope();
    const where = selectedIds?.length
      ? { id: { in: selectedIds }, storeId }
      : getWhere(storeId, search);

    const karigars = await prisma.karigar.findMany({
      where,
      orderBy: getOrderBy(sortBy, sortOrder),
    });

    if (!karigars.length) {
      return { success: false, message: "No karigars found to export." };
    }

    const rows = karigars.map((karigar, index) => ({
      "Sr No": index + 1,
      "Karigar Code": karigar.code ?? "",
      Name: karigar.name,
      Mobile: karigar.mobile ?? "",
      WhatsApp: karigar.whatsapp ?? "",
      Email: karigar.email ?? "",
      Address: karigar.address ?? "",
      City: karigar.city ?? "",
      Pincode: karigar.pincode ?? "",
      Specialization: karigar.specialization ?? "",
      GSTIN: karigar.gstNumber ?? "",
      "PAN Number": karigar.panNumber ?? "",
      "Aadhaar Number": karigar.aadhaarNumber ?? "",
      "Opening Gold (g)": Number(karigar.openingGold ?? 0),
      "Opening Cash": formatCurrencyINR(Number(karigar.openingCash ?? 0)),
      Status: karigar.isActive ? "Active" : "Inactive",
      Notes: karigar.notes ?? "",
      "Created At": formatDateIST(karigar.createdAt),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
      { wch: 26 },
      { wch: 30 },
      { wch: 16 },
      { wch: 12 },
      { wch: 22 },
      { wch: 18 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 30 },
      { wch: 16 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Karigars");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const fileName = getKarigarExportFileName();

    return {
      success: true,
      message: `Exported ${karigars.length} karigar(s) successfully.`,
      fileBase64: buffer.toString("base64"),
      fileName,
    };
  } catch (error) {
    console.error("exportKarigarsToExcel error:", error);
    return { success: false, message: "Failed to export karigars." };
  }
}