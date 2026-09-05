// FILE PATH: lib/actions/karigar-actions.ts
// REPLACES the entire existing file at this path
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireStoreScope } from "@/lib/store-context";
import { getLocationScope, locationWhere, type LocationScope } from "@/lib/location-scope";
import { UserRole, UserStatus } from "@prisma/client";
import * as XLSX from "xlsx";
import { sendInviteEmailSafely, resolveStoreName } from "@/lib/invite-email";
import { classifyPurityFamily, type PurityFamily } from "@/lib/business-units";

export type Karigar = {
  id: string;
  code: string;
  name: string;
  mobile: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber: string;
  panNumber: string;
  aadhaarNumber: string;
  specialization: string;
  notes: string;
  openingGold: number;
  openingCash: number;
  isActive: boolean;
  locationId: string | null;
  /** Gold/Silver/Diamond/... this karigar mainly works with — separate from
   * the free-text `specialization` craft description. Drives the Karigars
   * page's Type filter (classifyPurityFamily), same as Stock's. */
  metalTypeId: string | null;
  metalTypeName: string;
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
  /** Defaults to true (only active karigars) — matches the main Karigars
   *  list. Pass false to list disabled ones instead (see /karigars/disabled),
   *  mirroring how getVendors()'s `archived` param works. */
  active?: boolean;
  /** Gold/Silver/Platinum/Diamond/Stone/Other — derived from each karigar's
   * metalType (name + isGemstone), same classification Stock's Type filter
   * already uses. */
  metalFamily?: PurityFamily;
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
  type?: string;
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
    state: karigar.state ?? "",
    pincode: karigar.pincode ?? "",
    gstNumber: karigar.gstNumber ?? "",
    panNumber: karigar.panNumber ?? "",
    aadhaarNumber: karigar.aadhaarNumber ?? "",
    specialization: karigar.specialization ?? "",
    notes: karigar.notes ?? "",
    openingGold: Number(karigar.openingGold),
    openingCash: Number(karigar.openingCash),
    isActive: karigar.isActive,
    locationId: karigar.locationId ?? null,
    metalTypeId: karigar.metalTypeId ?? null,
    metalTypeName: karigar.metalType?.name ?? "",
    createdAt: karigar.createdAt?.toISOString?.() ?? undefined,
  };
}

/**
 * StoreMetal is a free-text, store-managed list with no fixed FK for "the
 * Gold row" — so filtering Karigars by Type first resolves which StoreMetal
 * ids classify into the requested family (classifyPurityFamily, the same
 * function Stock's own Type filter uses), then filters metalTypeId against
 * that list.
 */
async function resolveMetalTypeIdsForFamily(storeId: string, family: PurityFamily) {
  const metals = await prisma.storeMetal.findMany({
    where: { storeId },
    select: { id: true, name: true, isGemstone: true },
  });
  return metals.filter((metal) => classifyPurityFamily(metal) === family).map((metal) => metal.id);
}

function getWhere(
  storeId: string,
  search: string | undefined,
  scope: LocationScope,
  active = true,
  metalTypeIds?: string[],
) {
  const query = String(search || "").trim();

  return {
    storeId,
    isActive: active,
    ...locationWhere(scope),
    ...(metalTypeIds ? { metalTypeId: { in: metalTypeIds } } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { code: { contains: query, mode: "insensitive" as const } },
            { mobile: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
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
  const scope = await getLocationScope();
  const metalTypeIds = params.metalFamily
    ? await resolveMetalTypeIdsForFamily(storeId, params.metalFamily)
    : undefined;
  const where = getWhere(storeId, search, scope, params.active ?? true, metalTypeIds);

  const [totalCount, karigars] = await Promise.all([
    prisma.karigar.count({ where }),
    prisma.karigar.findMany({
      where,
      orderBy: getOrderBy(sortBy, sortOrder),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { metalType: { select: { name: true } } },
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
  const scope = await getLocationScope();
  const karigar = await prisma.karigar.findFirst({
    where: { id, storeId, ...locationWhere(scope) },
    include: { metalType: { select: { name: true } } },
  });
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
    state: toOptionalString(formData.get("state")),
    pincode: toOptionalString(formData.get("pincode")),
    gstNumber: toOptionalString(formData.get("gstNumber")),
    panNumber: toOptionalString(formData.get("panNumber")),
    aadhaarNumber: toOptionalString(formData.get("aadhaarNumber")),
    specialization: toOptionalString(formData.get("specialization")),
    notes: toOptionalString(formData.get("notes")),
    openingGold: toNumber(formData.get("openingGold")),
    openingCash: toNumber(formData.get("openingCash")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
    locationId: toOptionalString(formData.get("locationId")),
    metalTypeId: toOptionalString(formData.get("metalTypeId")),
  };
}

/**
 * Mobile/email are the app's login identifiers (User.phone/User.email are
 * globally unique), so any contact info captured for a Karigar has to be
 * checked against every existing User (and the linked User of any other
 * Karigar) before it's saved — otherwise a karigar could silently be given
 * someone else's login credential.
 */
async function checkContactUniqueness(
  mobile: string | null,
  email: string | null,
  excludeUserId?: string,
): Promise<Record<string, string[]>> {
  const errors: Record<string, string[]> = {};

  if (mobile) {
    const existing = await prisma.user.findUnique({ where: { phone: mobile } });
    if (existing && existing.id !== excludeUserId) {
      errors.mobile = ["This phone number is already in use as another user's login"];
    }
  }

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== excludeUserId) {
      errors.email = ["This email is already in use as another user's login"];
    }
  }

  return errors;
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

    const contactErrors = await checkContactUniqueness(data.mobile, data.email);
    if (Object.keys(contactErrors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: contactErrors,
      };
    }

    const storeId = await requireStoreScope();

    if (data.locationId) {
      const location = await prisma.storeLocation.findFirst({
        where: { id: data.locationId, storeId },
        select: { id: true },
      });
      if (!location) {
        return {
          success: false,
          message: "Selected location is invalid",
          errors: { locationId: ["Selected location could not be found"] },
        };
      }
    }

    if (data.metalTypeId) {
      const metal = await prisma.storeMetal.findFirst({
        where: { id: data.metalTypeId, storeId },
        select: { id: true },
      });
      if (!metal) {
        return {
          success: false,
          message: "Selected metal type is invalid",
          errors: { metalTypeId: ["Selected metal type could not be found"] },
        };
      }
    }

    // A mobile or email doubles as the karigar's login — create their User
    // account in the same step, matching how a Store's initial Admin is
    // created alongside the Store itself.
    await prisma.$transaction(async (tx) => {
      const karigar = await tx.karigar.create({ data: { ...data, storeId } });

      if (data.mobile || data.email) {
        await tx.user.create({
          data: {
            name: data.name,
            phone: data.mobile,
            email: data.email,
            role: UserRole.KARIGAR,
            status: UserStatus.INVITED,
            isActive: true,
            storeId,
            karigarId: karigar.id,
          },
        });
      }
    });

    revalidatePath("/karigars");
    revalidatePath("/users");

    let emailSent = false;
    if (data.email) {
      emailSent = await sendInviteEmailSafely({
        email: data.email,
        phone: data.mobile,
        name: data.name,
        role: UserRole.KARIGAR,
        storeName: await resolveStoreName(storeId),
      });
    }

    return {
      success: true,
      message:
        data.mobile || data.email
          ? data.email && emailSent
            ? "Karigar created — a welcome email was sent so they can sign in"
            : "Karigar created — they can now sign in with this mobile/email"
          : "Karigar created successfully",
    };
  } catch (error: any) {
    if (error.code === "P2002") {
      return {
        success: false,
        message: "Karigar code, mobile, or email already exists",
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

    if (data.locationId) {
      const location = await prisma.storeLocation.findFirst({
        where: { id: data.locationId, storeId },
        select: { id: true },
      });
      if (!location) {
        return {
          success: false,
          message: "Selected location is invalid",
          errors: { locationId: ["Selected location could not be found"] },
        };
      }
    }

    if (data.metalTypeId) {
      const metal = await prisma.storeMetal.findFirst({
        where: { id: data.metalTypeId, storeId },
        select: { id: true },
      });
      if (!metal) {
        return {
          success: false,
          message: "Selected metal type is invalid",
          errors: { metalTypeId: ["Selected metal type could not be found"] },
        };
      }
    }

    const existing = await prisma.karigar.findFirst({
      where: { id, storeId },
      include: { loginUser: { select: { id: true } } },
    });

    if (!existing) {
      return { success: false, message: "Karigar not found" };
    }

    const contactErrors = await checkContactUniqueness(
      data.mobile,
      data.email,
      existing.loginUser?.id,
    );
    if (Object.keys(contactErrors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: contactErrors,
      };
    }

    // Keep the karigar's contact info and login credential in sync — either
    // update their existing login User, or (if this karigar never had one,
    // e.g. created before a mobile/email was on file) create it now.
    let loginJustCreated = false;
    await prisma.$transaction(async (tx) => {
      await tx.karigar.update({ where: { id }, data });

      if (existing.loginUser) {
        await tx.user.update({
          where: { id: existing.loginUser.id },
          data: { name: data.name, phone: data.mobile, email: data.email },
        });
      } else if (data.mobile || data.email) {
        await tx.user.create({
          data: {
            name: data.name,
            phone: data.mobile,
            email: data.email,
            role: UserRole.KARIGAR,
            status: UserStatus.INVITED,
            isActive: true,
            storeId,
            karigarId: id,
          },
        });
        loginJustCreated = true;
      }
    });

    revalidatePath("/karigars");
    revalidatePath(`/karigars/${id}`);
    revalidatePath("/users");

    // Only the moment this karigar first gets login access deserves a
    // welcome email — not every subsequent edit to an existing login.
    if (loginJustCreated && data.email) {
      await sendInviteEmailSafely({
        email: data.email,
        phone: data.mobile,
        name: data.name,
        role: UserRole.KARIGAR,
        storeName: await resolveStoreName(storeId),
      });
    }

    return { success: true, message: "Karigar updated successfully" };
  } catch (error: any) {
    if (error.code === "P2002") {
      return {
        success: false,
        message: "Karigar code, mobile, or email already exists",
      };
    }
    console.error("updateKarigar error:", error);
    return { success: false, message: "Failed to update karigar" };
  }
}

/**
 * Disable/enable a karigar — the reversible alternative to deleteKarigar,
 * which is blocked outright once a karigar has any job or ledger history
 * (see its own error message below). Unlike delete, this has no such
 * restriction: a karigar with a full job/ledger history is exactly the
 * normal case for disabling one (they've simply stopped working with you),
 * and their records must stay intact and queryable either way. Mirrors
 * archiveVendor/unarchiveVendor's shape (lib/actions/vendor-actions.ts).
 */
export async function disableKarigar(id: string): Promise<KarigarFormState> {
  try {
    const storeId = await requireStoreScope();

    const { count } = await prisma.karigar.updateMany({
      where: { id, storeId },
      data: { isActive: false },
    });

    if (count === 0) {
      return { success: false, message: "Karigar not found" };
    }

    revalidatePath("/karigars");
    revalidatePath("/karigars/disabled");
    revalidatePath(`/karigars/${id}`);

    return { success: true, message: "Karigar disabled" };
  } catch (error) {
    console.error("disableKarigar error:", error);
    return { success: false, message: "Failed to disable karigar" };
  }
}

export async function enableKarigar(id: string): Promise<KarigarFormState> {
  try {
    const storeId = await requireStoreScope();

    const { count } = await prisma.karigar.updateMany({
      where: { id, storeId },
      data: { isActive: true },
    });

    if (count === 0) {
      return { success: false, message: "Karigar not found" };
    }

    revalidatePath("/karigars");
    revalidatePath("/karigars/disabled");
    revalidatePath(`/karigars/${id}`);

    return { success: true, message: "Karigar re-enabled" };
  } catch (error) {
    console.error("enableKarigar error:", error);
    return { success: false, message: "Failed to re-enable karigar" };
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
        loginUser: { select: { id: true } },
      },
    });

    if (!karigar) {
      return { success: false, message: "Karigar not found" };
    }

    // Jobs are the real blocker: deleting a karigar with job history would
    // orphan KarigarReceiptItem/InventoryStock rows that trace back to them,
    // which is real inventory data, not just a record. Ledger entries are
    // NOT a blocker: LedgerEntry.karigarId is ON DELETE SET NULL (see the
    // migration), so any standalone payment entries recorded against a
    // karigar who was never issued a job survive the delete - they just
    // lose the karigar attribution, which is fine since there's no job to
    // reconcile them against anyway.
    if (karigar.karigarJobs.length > 0) {
      return {
        success: false,
        message: "This karigar has jobs linked to them and cannot be deleted. Mark them inactive instead.",
      };
    }

    // Their login (if any) has nowhere else to point once the karigar row
    // is gone, so it's removed in the same transaction.
    await prisma.$transaction(async (tx) => {
      if (karigar.loginUser) {
        await tx.user.delete({ where: { id: karigar.loginUser.id } });
      }
      await tx.karigar.delete({ where: { id } });
    });

    revalidatePath("/karigars");
    revalidatePath("/users");

    const message =
      karigar.ledgerEntries.length > 0
        ? "Karigar deleted successfully. Their recorded payments are kept but no longer linked to a karigar."
        : "Karigar deleted successfully";

    return { success: true, message };
  } catch (error) {
    console.error("deleteKarigar error:", error);
    return { success: false, message: "Failed to delete karigar" };
  }
}

export type BulkDeleteResult = {
  deletedCount: number;
  failures: { id: string; message: string }[];
};

/**
 * Deletes each selected karigar through the exact same deleteKarigar()
 * call a single-row delete uses — never a bare deleteMany — so a bulk
 * selection can't bypass the linked-jobs guard just because several rows
 * were ticked at once. Partial success is expected and reported per row,
 * not treated as a whole-batch failure.
 */
export async function bulkDeleteKarigars(ids: string[]): Promise<BulkDeleteResult> {
  const failures: BulkDeleteResult["failures"] = [];
  let deletedCount = 0;

  for (const id of ids) {
    const result = await deleteKarigar(id);
    if (result.success) {
      deletedCount++;
    } else {
      failures.push({ id, message: result.message });
    }
  }

  return { deletedCount, failures };
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
    const scope = await getLocationScope();

    const validFamilies: PurityFamily[] = ["GOLD", "SILVER", "PLATINUM", "DIAMOND", "STONE", "OTHER"];
    const metalFamily = validFamilies.includes(params.type as PurityFamily)
      ? (params.type as PurityFamily)
      : undefined;

    const where = selectedIds?.length
      ? { id: { in: selectedIds }, storeId, ...locationWhere(scope) }
      : getWhere(
          storeId,
          search,
          scope,
          true,
          metalFamily ? await resolveMetalTypeIdsForFamily(storeId, metalFamily) : undefined,
        );

    const karigars = await prisma.karigar.findMany({
      where,
      orderBy: getOrderBy(sortBy, sortOrder),
      include: { metalType: { select: { name: true } } },
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
      "Metal Type": karigar.metalType?.name ?? "",
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