// FILE PATH: lib/actions/karigar-actions.ts
// REPLACES the entire existing file at this path
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context";
import { actionErrorMessage } from "@/lib/action-error";
import { getLocationScope, locationWhere, type LocationScope } from "@/lib/location-scope";
import { UserRole, UserStatus, Prisma, type PartyGstType } from "@prisma/client";
import * as XLSX from "xlsx";
import {
  buildCsvExportBase64,
  buildPdfExportBase64,
  buildMultiSheetExcelExport,
  parseExcelUpload,
} from "@/lib/excel-export";
import { PARTY_GST_TYPE_OPTIONS } from "@/lib/gst";
import { sendInviteEmailSafely, resolveStoreName } from "@/lib/invite-email";
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units";
import { isValidAadhaarNumber, normalizeAadhaarNumber, AADHAAR_INVALID_MESSAGE } from "@/lib/aadhaar";
import { isValidPanNumber, normalizePanNumber, PAN_INVALID_MESSAGE } from "@/lib/pan";
import { formatShortDate } from "@/lib/utils";
import {
  getKarigarLedger,
  getKarigarMaterialCounts,
  type KarigarLedgerResult,
  type KarigarMaterialCounts,
} from "@/lib/actions/ledger-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions";
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions";
import type { StoreLocationRow } from "@/lib/actions/store-location-actions";
import { logger } from "@/lib/logger";

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
  /** This karigar's own GST registration status — same PartyGstType/
   * gstinRequired rule used for Customer/Vendor's gstNumber field. */
  gstType: PartyGstType;
  panNumber: string;
  aadhaarNumber: string;
  specialization: string;
  notes: string;
  imageUrl: string;
  openingGold: number;
  openingCash: number;
  isActive: boolean;
  locationId: string | null;
  /** This karigar's main StoreMetal (Settings > Taxonomy) — separate from
   * the free-text `specialization` craft description. Drives the Karigars
   * page's Type filter, same as Stock's. */
  metalTypeId: string | null;
  metalTypeName: string;
  /** Metals/stones this karigar is assigned to work with (KarigarMetal) —
   * Issue/Receive Material only ever offers metals in this list. Separate
   * from the single metalTypeId/metalTypeName above. */
  assignedMetalTypeIds: string[];
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
  /** Filters by the store's own StoreMetal id (Settings > Taxonomy) — or
   * "UNASSIGNED" for karigars with no metal set. Dynamic: whatever the
   * store has configured, not a fixed set of categories. */
  metalTypeId?: string;
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
  format?: "csv" | "xlsx" | "pdf";
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
    gstType: karigar.gstType ?? "UNREGISTERED",
    panNumber: karigar.panNumber ?? "",
    aadhaarNumber: karigar.aadhaarNumber ?? "",
    specialization: karigar.specialization ?? "",
    notes: karigar.notes ?? "",
    imageUrl: karigar.imageUrl ?? "",
    openingGold: Number(karigar.openingGold),
    openingCash: Number(karigar.openingCash),
    isActive: karigar.isActive,
    locationId: karigar.locationId ?? null,
    metalTypeId: karigar.metalTypeId ?? null,
    metalTypeName: karigar.metalType?.name ?? "",
    assignedMetalTypeIds: (karigar.assignedMetals ?? []).map((row: { metalTypeId: string }) => row.metalTypeId),
    createdAt: karigar.createdAt?.toISOString?.() ?? undefined,
  };
}

/**
 * "Type" filters directly by the store's own configured StoreMetal id —
 * whatever metals/stones this store has set up in Settings > Taxonomy, not
 * a fixed set of hardcoded categories. A store adding a new metal or stone
 * there needs no code change for it to show up as its own filter option.
 * The sentinel "UNASSIGNED" (lib/business-units.ts) filters to karigars
 * with no metal set at all.
 */
function getWhere(
  storeId: string,
  search: string | undefined,
  scope: LocationScope,
  active = true,
  metalTypeId?: string,
) {
  const query = String(search || "").trim();

  return {
    storeId,
    isActive: active,
    ...locationWhere(scope),
    ...(metalTypeId === UNASSIGNED_METAL_TYPE
      ? { metalTypeId: null }
      : metalTypeId
        ? { metalTypeId }
        : {}),
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
  const where = getWhere(storeId, search, scope, params.active ?? true, params.metalTypeId);

  const [totalCount, karigars] = await Promise.all([
    prisma.karigar.count({ where }),
    prisma.karigar.findMany({
      where,
      orderBy: getOrderBy(sortBy, sortOrder),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        metalType: { select: { name: true } },
        assignedMetals: { select: { metalTypeId: true } },
      },
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
  const storeId = await getStoreIdForRead();
  const scope = await getLocationScope();
  const karigar = await prisma.karigar.findFirst({
    where: { id, storeId, ...locationWhere(scope) },
    include: {
      metalType: { select: { name: true } },
      assignedMetals: { select: { metalTypeId: true } },
    },
  });
  if (!karigar) return null;
  return mapKarigar(karigar);
}

export type KarigarOpenJob = {
  id: string;
  jobNumber: string | null;
  issueDate: string;
  expectedDate: string | null;
  issueWeight: number;
  issuePurity: string | null;
  issueFineWeight: number;
  receiveWeight: number;
};

export type KarigarDetailBundle = {
  karigar: Karigar;
  ledger: KarigarLedgerResult;
  metals: StoreMetalRow[];
  locations: StoreLocationRow[];
  defaultLocationId: string | null;
  openJobs: KarigarOpenJob[];
  materialCounts: KarigarMaterialCounts;
};

function formatKarigarDate(date: Date | null) {
  if (!date) return null;
  return formatShortDate(date);
}

/** Everything the karigar detail view needs, bundled into one call — reused by the standalone /karigars/[id] page and the inline detail panel on the Karigars list. */
export async function getKarigarDetailBundle(id: string): Promise<KarigarDetailBundle | null> {
  const karigar = await getKarigarById(id);
  if (!karigar) return null;

  const storeId = await getStoreIdForRead();
  const scope = await getLocationScope();

  const [ledger, metals, locations, defaultLocationId, openJobsRaw, materialCounts] = await Promise.all([
    getKarigarLedger(id, karigar.name),
    getStoreMetals(),
    getStoreLocations(),
    getDefaultLocationId(),
    prisma.karigarJob.findMany({
      where: { storeId, karigarId: id, status: "issued", ...locationWhere(scope) },
      orderBy: { issueDate: "desc" },
    }),
    getKarigarMaterialCounts(id),
  ]);

  const openJobs: KarigarOpenJob[] = openJobsRaw.map((job) => ({
    id: job.id,
    jobNumber: job.jobNumber,
    issueDate: formatKarigarDate(job.issueDate) ?? "-",
    expectedDate: formatKarigarDate(job.expectedDate),
    issueWeight: job.issueWeight ? Number(job.issueWeight) : 0,
    issuePurity: job.issuePurity,
    issueFineWeight: job.issueFineWeight ? Number(job.issueFineWeight) : 0,
    receiveWeight: job.receiveWeight ? Number(job.receiveWeight) : 0,
  }));

  return { karigar, ledger, metals, locations, defaultLocationId, openJobs, materialCounts };
}

/** Karigar.code is system-generated (generateKarigarCode) and immutable —
 * never read from the form, on create or edit, so there's nothing here for
 * a submitted "code" field to override even if one were somehow present. */
function buildKarigarData(formData: FormData) {
  return {
    name: String(formData.get("name") || "").trim(),
    mobile: toOptionalString(formData.get("mobile")),
    whatsapp: toOptionalString(formData.get("whatsapp")),
    email: toOptionalString(formData.get("email")),
    address: toOptionalString(formData.get("address")),
    city: toOptionalString(formData.get("city")),
    state: toOptionalString(formData.get("state")),
    pincode: toOptionalString(formData.get("pincode")),
    gstNumber: toOptionalString(formData.get("gstNumber")),
    gstType: (() => {
      const raw = String(formData.get("gstType") || "");
      const valid: PartyGstType[] = ["UNREGISTERED", "REGULAR", "COMPOSITION"];
      return (valid as string[]).includes(raw) ? (raw as PartyGstType) : "UNREGISTERED";
    })(),
    panNumber: (() => {
      const raw = toOptionalString(formData.get("panNumber"));
      return raw ? normalizePanNumber(raw) : null;
    })(),
    aadhaarNumber: (() => {
      const raw = toOptionalString(formData.get("aadhaarNumber"));
      return raw ? normalizeAadhaarNumber(raw) : null;
    })(),
    specialization: toOptionalString(formData.get("specialization")),
    notes: toOptionalString(formData.get("notes")),
    imageUrl: toOptionalString(formData.get("imageUrl")),
    openingGold: toNumber(formData.get("openingGold")),
    openingCash: toNumber(formData.get("openingCash")),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
    locationId: toOptionalString(formData.get("locationId")),
    metalTypeId: toOptionalString(formData.get("metalTypeId")),
  };
}

/** Deduped ids of every "Assigned Metals/Stones" checkbox the form
 * submitted — separate from buildKarigarData since KarigarMetal is its own
 * table, not a scalar column on Karigar. */
function extractAssignedMetalTypeIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("assignedMetalTypeIds").map((value) => String(value).trim()).filter(Boolean))];
}

/** Every submitted id has to actually be one of this store's own
 * StoreMetal rows — otherwise Issue/Receive Material could end up gated
 * against an id belonging to nothing (or, worse, another store). */
async function validateAssignedMetalTypeIds(
  storeId: string,
  metalTypeIds: string[],
): Promise<Record<string, string[]> | null> {
  if (metalTypeIds.length === 0) return null;

  const found = await prisma.storeMetal.findMany({
    where: { id: { in: metalTypeIds }, storeId },
    select: { id: true },
  });

  if (found.length !== metalTypeIds.length) {
    return { assignedMetalTypeIds: ["One or more selected metals/stones could not be found"] };
  }

  return null;
}

/** Karigar.code is always system-generated, never typed — mirrors
 * generateJobNumber's own count-based scheme (lib/actions/inventory-stock-actions.ts)
 * for the same reason: one predictable, unique-per-store, human-readable id. */
async function generateKarigarCode(storeId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.karigar.count({
    where: { storeId, code: { startsWith: `KAR-${year}-` } },
  });

  return `KAR-${year}-${String(count + 1).padStart(4, "0")}`;
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

/** Both KYC ids are optional, so only checked (checksum for Aadhaar,
 * structure for PAN) when the karigar actually entered one. */
function validateKarigarKycFields(aadhaarNumber: string | null, panNumber: string | null) {
  const errors: Record<string, string[]> = {};

  if (aadhaarNumber && !isValidAadhaarNumber(aadhaarNumber)) {
    errors.aadhaarNumber = [AADHAAR_INVALID_MESSAGE];
  }

  if (panNumber && !isValidPanNumber(panNumber)) {
    errors.panNumber = [PAN_INVALID_MESSAGE];
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
        message: "Artisan name is required",
        errors: { name: ["Name is required"] },
      };
    }

    const data = buildKarigarData(formData);
    // isActive should default to true on create, not depend on a checkbox being present
    if (formData.get("isActive") === null) data.isActive = true;

    const kycErrors = validateKarigarKycFields(data.aadhaarNumber, data.panNumber);
    if (Object.keys(kycErrors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: kycErrors,
      };
    }

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

    const assignedMetalTypeIds = extractAssignedMetalTypeIds(formData);
    const assignedMetalErrors = await validateAssignedMetalTypeIds(storeId, assignedMetalTypeIds);
    if (assignedMetalErrors) {
      return { success: false, message: "Please fix the form errors", errors: assignedMetalErrors };
    }

    const code = await generateKarigarCode(storeId);

    // A mobile or email doubles as the karigar's login — create their User
    // account in the same step, matching how a Store's initial Admin is
    // created alongside the Store itself.
    await prisma.$transaction(async (tx) => {
      const karigar = await tx.karigar.create({ data: { ...data, code, storeId } });

      if (assignedMetalTypeIds.length > 0) {
        await tx.karigarMetal.createMany({
          data: assignedMetalTypeIds.map((metalTypeId) => ({ karigarId: karigar.id, metalTypeId })),
        });
      }

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
            ? "Artisan created — a welcome email was sent so they can sign in"
            : "Artisan created — they can now sign in with this mobile/email"
          : "Artisan created successfully",
    };
  } catch (error: any) {
    if (error.code === "P2002") {
      return {
        success: false,
        message: "Artisan code, mobile, or email already exists",
      };
    }
    logger.error("createKarigar error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to create artisan") };
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
        message: "Artisan name is required",
        errors: { name: ["Name is required"] },
      };
    }

    const data = buildKarigarData(formData);

    const kycErrors = validateKarigarKycFields(data.aadhaarNumber, data.panNumber);
    if (Object.keys(kycErrors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: kycErrors,
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

    const assignedMetalTypeIds = extractAssignedMetalTypeIds(formData);
    const assignedMetalErrors = await validateAssignedMetalTypeIds(storeId, assignedMetalTypeIds);
    if (assignedMetalErrors) {
      return { success: false, message: "Please fix the form errors", errors: assignedMetalErrors };
    }

    const existing = await prisma.karigar.findFirst({
      where: { id, storeId },
      include: { loginUser: { select: { id: true } } },
    });

    if (!existing) {
      return { success: false, message: "Artisan not found" };
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

      // Replace-the-whole-set: simplest correct way to reconcile "every
      // checkbox the form just submitted" against whatever was assigned
      // before, without diffing adds/removes by hand.
      await tx.karigarMetal.deleteMany({ where: { karigarId: id } });
      if (assignedMetalTypeIds.length > 0) {
        await tx.karigarMetal.createMany({
          data: assignedMetalTypeIds.map((metalTypeId) => ({ karigarId: id, metalTypeId })),
        });
      }

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

    return { success: true, message: "Artisan updated successfully" };
  } catch (error: any) {
    if (error.code === "P2002") {
      return {
        success: false,
        message: "Artisan code, mobile, or email already exists",
      };
    }
    logger.error("updateKarigar error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update artisan") };
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
      return { success: false, message: "Artisan not found" };
    }

    revalidatePath("/karigars");
    revalidatePath("/karigars/disabled");
    revalidatePath(`/karigars/${id}`);

    return { success: true, message: "Artisan disabled" };
  } catch (error) {
    logger.error("disableKarigar error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to disable artisan") };
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
      return { success: false, message: "Artisan not found" };
    }

    revalidatePath("/karigars");
    revalidatePath("/karigars/disabled");
    revalidatePath(`/karigars/${id}`);

    return { success: true, message: "Artisan re-enabled" };
  } catch (error) {
    logger.error("enableKarigar error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to re-enable artisan") };
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
      return { success: false, message: "Artisan not found" };
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
        message: "This artisan has jobs linked to them and cannot be deleted. Mark them inactive instead.",
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
        ? "Artisan deleted successfully. Their recorded payments are kept but no longer linked to an artisan."
        : "Artisan deleted successfully";

    return { success: true, message };
  } catch (error) {
    logger.error("deleteKarigar error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete artisan") };
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
  return formatShortDate(date);
}

function getKarigarExportFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `artisans-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.xlsx`;
}

export async function exportKarigarsToExcel(
  params: ExportKarigarsParams,
): Promise<ExportResult> {
  try {
    const { selectedIds, search, sortBy = "createdAt", sortOrder = "desc" } = params;

    const storeId = await requireStoreScope();
    const scope = await getLocationScope();

    const where = selectedIds?.length
      ? { id: { in: selectedIds }, storeId, ...locationWhere(scope) }
      : getWhere(storeId, search, scope, true, params.type);

    const karigars = await prisma.karigar.findMany({
      where,
      orderBy: getOrderBy(sortBy, sortOrder),
      include: { metalType: { select: { name: true } } },
    });

    if (!karigars.length) {
      return { success: false, message: "No artisans found to export." };
    }

    const rows = karigars.map((karigar, index) => ({
      "Sr No": index + 1,
      "Artisan Code": karigar.code ?? "",
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

    if (params.format === "csv") {
      const { fileName, fileBase64 } = buildCsvExportBase64(rows, "artisans");
      return {
        success: true,
        message: `Exported ${karigars.length} artisan(s) successfully.`,
        fileBase64,
        fileName,
      };
    }

    if (params.format === "pdf") {
      const { fileName, fileBase64 } = buildPdfExportBase64(rows, "Artisans", "artisans");
      return {
        success: true,
        message: `Exported ${karigars.length} artisan(s) successfully.`,
        fileBase64,
        fileName,
      };
    }

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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Artisans");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const fileName = getKarigarExportFileName();

    return {
      success: true,
      message: `Exported ${karigars.length} artisan(s) successfully.`,
      fileBase64: buffer.toString("base64"),
      fileName,
    };
  } catch (error) {
    logger.error("exportKarigarsToExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to export artisans.") };
  }
}

export type KarigarImportResult = {
  success: boolean;
  message: string;
  createdCount?: number;
  /** Row-level problems. Populated only when nothing was created — nothing
   * is written until the whole file is clean. */
  errors?: string[];
};

/**
 * A downloadable .xlsx showing the expected columns and one filled-in
 * example row. Metal Type/Assigned Metals/Location are entered as names,
 * matched against this store's own Settings > Taxonomy / Locations.
 * Artisan Code is never a column — it's auto-generated on import exactly
 * like the single "Add Artisan" form generates it.
 */
export async function getKarigarImportTemplate(): Promise<{
  fileName: string;
  fileBase64: string;
}> {
  await requireStoreScope();

  const example = {
    Name: "Ramesh Sonar",
    Mobile: "",
    WhatsApp: "",
    Email: "",
    Address: "",
    City: "Mumbai",
    State: "Maharashtra",
    Pincode: "400001",
    "GST Number": "",
    "GST Type": "Not GST Registered",
    "PAN Number": "",
    "Aadhaar Number": "",
    Specialization: "Chain making",
    "Metal Type": "Gold",
    "Assigned Metals/Stones": "Gold, Silver",
    Location: "",
    "Opening Gold": 0,
    "Opening Cash": 0,
    Notes: "",
    Active: "Yes",
  };

  return buildMultiSheetExcelExport(
    [{ name: "Artisans Import", rows: [example], columns: Object.keys(example) }],
    "artisans-import-template",
  );
}

function karigarImportCell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

function parseKarigarGstTypeLabel(raw: string): PartyGstType {
  const match = PARTY_GST_TYPE_OPTIONS.find(
    (option) => option.label.toLowerCase() === raw.toLowerCase(),
  );
  return (match?.value ?? "UNREGISTERED") as PartyGstType;
}

function karigarImportYesNo(row: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const raw = karigarImportCell(row, key).toLowerCase();
  if (raw === "yes" || raw === "true") return true;
  if (raw === "no" || raw === "false") return false;
  return fallback;
}

/**
 * Bulk-adds artisans from one spreadsheet — mirrors importProductsFromExcel's
 * contract exactly: batch-resolve every FK name up front, validate every row
 * with zero writes, and only once the whole file is clean assign codes and
 * write. Deliberately does NOT create a User login for a row's Mobile/Email
 * (unlike the single "Add Artisan" form) — doing that per-row on a bulk
 * import would silently mass-invite/email everyone in the file. Mobile/Email
 * are still stored on the Karigar row; a login can be added later the normal
 * way (edit the artisan) if wanted. Since no User row is created, the
 * mobile/email-must-be-a-unique-login check the single form does doesn't
 * apply here either.
 */
export async function importKarigarsFromExcel(
  formData: FormData,
): Promise<KarigarImportResult> {
  try {
    const storeId = await requireStoreScope();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return { success: false, message: "Choose a .xlsx or .csv file to import." };
    }

    const rows = parseExcelUpload(await file.arrayBuffer());

    if (!rows.length) {
      return { success: false, message: "That file has no rows to import." };
    }

    const [metals, locations] = await Promise.all([
      prisma.storeMetal.findMany({ where: { storeId }, select: { id: true, name: true } }),
      prisma.storeLocation.findMany({ where: { storeId }, select: { id: true, name: true } }),
    ]);

    const metalByName = new Map(metals.map((m) => [m.name.trim().toLowerCase(), m]));
    const locationByName = new Map(locations.map((l) => [l.name.trim().toLowerCase(), l.id]));

    type ResolvedRow = {
      fields: Omit<Prisma.KarigarCreateManyInput, "storeId" | "code">;
      assignedMetalTypeIds: string[];
    };

    const errors: string[] = [];
    const resolvedRows: ResolvedRow[] = [];

    for (const [index, row] of rows.entries()) {
      // +2 = one for the header row, one for 1-based spreadsheet numbering.
      const line = index + 2;
      const rowErrors: string[] = [];

      const name = karigarImportCell(row, "Name");
      if (!name) rowErrors.push("Name is required");

      const aadhaarNumber = karigarImportCell(row, "Aadhaar Number");
      if (aadhaarNumber && !isValidAadhaarNumber(aadhaarNumber)) {
        rowErrors.push(AADHAAR_INVALID_MESSAGE);
      }

      const panNumber = karigarImportCell(row, "PAN Number");
      if (panNumber && !isValidPanNumber(panNumber)) {
        rowErrors.push(PAN_INVALID_MESSAGE);
      }

      const metalName = karigarImportCell(row, "Metal Type");
      const metal = metalName ? metalByName.get(metalName.toLowerCase()) : undefined;
      if (metalName && !metal) {
        rowErrors.push(`No metal type found named "${metalName}"`);
      }

      const assignedNamesRaw = karigarImportCell(row, "Assigned Metals/Stones");
      const assignedMetalTypeIds: string[] = [];
      if (assignedNamesRaw) {
        for (const rawName of assignedNamesRaw.split(",")) {
          const trimmed = rawName.trim();
          if (!trimmed) continue;
          const assigned = metalByName.get(trimmed.toLowerCase());
          if (!assigned) {
            rowErrors.push(`No metal/stone found named "${trimmed}"`);
          } else {
            assignedMetalTypeIds.push(assigned.id);
          }
        }
      }

      const locationName = karigarImportCell(row, "Location");
      const locationId = locationName ? (locationByName.get(locationName.toLowerCase()) ?? null) : null;
      if (locationName && !locationId) {
        rowErrors.push(`No location found named "${locationName}"`);
      }

      const rawOpeningGold = karigarImportCell(row, "Opening Gold");
      const openingGold = rawOpeningGold === "" ? 0 : Number(rawOpeningGold);
      if (!Number.isFinite(openingGold)) rowErrors.push("Opening Gold must be a number");

      const rawOpeningCash = karigarImportCell(row, "Opening Cash");
      const openingCash = rawOpeningCash === "" ? 0 : Number(rawOpeningCash);
      if (!Number.isFinite(openingCash)) rowErrors.push("Opening Cash must be a number");

      if (rowErrors.length > 0) {
        for (const message of rowErrors) errors.push(`Row ${line}: ${message}`);
        continue;
      }

      resolvedRows.push({
        fields: {
          name,
          mobile: karigarImportCell(row, "Mobile") || null,
          whatsapp: karigarImportCell(row, "WhatsApp") || null,
          email: karigarImportCell(row, "Email") || null,
          address: karigarImportCell(row, "Address") || null,
          city: karigarImportCell(row, "City") || null,
          state: karigarImportCell(row, "State") || null,
          pincode: karigarImportCell(row, "Pincode") || null,
          gstNumber: karigarImportCell(row, "GST Number") || null,
          gstType: parseKarigarGstTypeLabel(karigarImportCell(row, "GST Type")),
          panNumber: panNumber ? normalizePanNumber(panNumber) : null,
          aadhaarNumber: aadhaarNumber ? normalizeAadhaarNumber(aadhaarNumber) : null,
          specialization: karigarImportCell(row, "Specialization") || null,
          notes: karigarImportCell(row, "Notes") || null,
          openingGold,
          openingCash,
          isActive: karigarImportYesNo(row, "Active", true),
          locationId,
          metalTypeId: metal?.id ?? null,
        },
        assignedMetalTypeIds,
      });
    }

    if (errors.length > 0) {
      return {
        success: false,
        message: "Nothing was imported. Fix these rows and try again.",
        errors,
      };
    }

    if (!resolvedRows.length) {
      return { success: false, message: "That file has no rows to import." };
    }

    // Same max-based derivation as generateKarigarCode's own single-row
    // logic, computed once and incremented in-memory per row rather than
    // re-counting the table on every row.
    const year = new Date().getFullYear();
    const existingCodes = await prisma.karigar.findMany({
      where: { storeId, code: { startsWith: `KAR-${year}-` } },
      select: { code: true },
    });
    let highestSeq = existingCodes.reduce((max, row) => {
      const match = /^KAR-\d{4}-(\d+)$/.exec(row.code ?? "");
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    const toCreate: Prisma.KarigarCreateManyInput[] = resolvedRows.map((row) => {
      highestSeq += 1;
      return {
        storeId,
        code: `KAR-${year}-${String(highestSeq).padStart(4, "0")}`,
        ...row.fields,
      };
    });

    const createdKarigars = await prisma.karigar.createManyAndReturn({
      data: toCreate,
      select: { id: true, code: true },
    });
    const karigarIdByCode = new Map(createdKarigars.map((k) => [k.code, k.id]));

    const karigarMetalRows: Prisma.KarigarMetalCreateManyInput[] = [];
    for (const [index, created] of toCreate.entries()) {
      const karigarId = karigarIdByCode.get(created.code!);
      if (!karigarId) continue;
      for (const metalTypeId of resolvedRows[index].assignedMetalTypeIds) {
        karigarMetalRows.push({ karigarId, metalTypeId });
      }
    }

    if (karigarMetalRows.length) {
      await prisma.karigarMetal.createMany({ data: karigarMetalRows });
    }

    revalidatePath("/karigars");

    return {
      success: true,
      message: `Added ${toCreate.length} ${toCreate.length === 1 ? "artisan" : "artisans"}.`,
      createdCount: toCreate.length,
    };
  } catch (error) {
    logger.error("importKarigarsFromExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to import artisans.") };
  }
}