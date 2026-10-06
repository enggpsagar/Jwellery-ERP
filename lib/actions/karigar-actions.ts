// FILE PATH: lib/actions/karigar-actions.ts
// REPLACES the entire existing file at this path
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireStoreScope, getStoreIdForRead, assertPlanActiveForExport } from "@/lib/store-context";
import { actionErrorMessage } from "@/lib/action-error";
import {
  getLocationScope,
  isLocationAllowed,
  locationWhere,
  resolveWritableLocationId,
  type LocationScope,
} from "@/lib/location-scope";
import { UserRole, UserStatus, Prisma, type PartyGstType } from "@prisma/client";
import {
  buildCsvExportBase64,
  buildPdfExportBase64,
  buildImportTemplateWithDropdowns,
  parseExcelUpload,
} from "@/lib/excel-export";
import { PARTY_GST_TYPE_OPTIONS, gstinRequired, partyGstTypeLabel } from "@/lib/gst";
import {
  KARIGAR_SHEET_NOTES,
  karigarExportHeaders,
  karigarHiddenHeaders,
  karigarSheetCell,
  karigarSheetColumns,
  karigarSheetHeaders,
  karigarSheetInstructions,
  parseKarigarSheetNumber,
  parseKarigarSheetYesNo,
} from "@/lib/karigars/karigar-sheet";
import { dropdownsFor, pickSheetRow, stripHiddenSheetColumns } from "@/lib/sheet-features";
import { getSheetFeatures } from "@/lib/sheet-features.server";
import { getBusinessSettings } from "@/lib/actions/settings-actions";
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
import { earlierRowHint, existingRecordHint, namesAsCandidates, suggestFrom } from "@/lib/import-suggest";
import { parseDateRangeBoundary } from "@/lib/date-range";

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
  /** Set only by createKarigar, on success — the new row's id. */
  id?: string;
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
  dateFrom?: string;
  dateTo?: string;
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
  dateFrom?: string;
  dateTo?: string;
  /** Without a selection: which list to export — active artisans (the
   * default, the main Artisans list) or disabled ones. */
  active?: boolean;
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
  dateFrom?: string,
  dateTo?: string,
) {
  const query = String(search || "").trim();
  const from = parseDateRangeBoundary(dateFrom, false);
  const to = parseDateRangeBoundary(dateTo, true);

  return {
    storeId,
    isActive: active,
    ...locationWhere(scope),
    ...(metalTypeId === UNASSIGNED_METAL_TYPE
      ? { metalTypeId: null }
      : metalTypeId
        ? { metalTypeId }
        : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
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
  const where = getWhere(storeId, search, scope, params.active ?? true, params.metalTypeId, params.dateFrom, params.dateTo);

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
  /** The real per-Metal Purity label (e.g. "22K") when set — preferred
   *  over the legacy issuePurity enum for display. */
  issuePurityLabel: string | null;
  metalName: string | null;
  issueFineWeight: number;
  receiveWeight: number;
  /** Linked Draft Order's number, when the job came from Send to Artisan. */
  draftOrderNumber: string | null;
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
      include: { metalType: { select: { name: true } } },
    }),
    getKarigarMaterialCounts(id),
  ]);

  const linkedDraftOrders = openJobsRaw.length
    ? await prisma.draftOrder.findMany({
        where: { storeId, karigarJobId: { in: openJobsRaw.map((job) => job.id) } },
        select: { karigarJobId: true, orderNumber: true },
      })
    : [];
  const draftOrderNumberByJob = new Map(
    linkedDraftOrders.map((order) => [order.karigarJobId as string, order.orderNumber]),
  );

  const openJobs: KarigarOpenJob[] = openJobsRaw.map((job) => ({
    id: job.id,
    jobNumber: job.jobNumber,
    issueDate: formatKarigarDate(job.issueDate) ?? "-",
    expectedDate: formatKarigarDate(job.expectedDate),
    issueWeight: job.issueWeight ? Number(job.issueWeight) : 0,
    issuePurity: job.issuePurity,
    issuePurityLabel: job.issuePurityLabel,
    metalName: job.metalType?.name ?? null,
    issueFineWeight: job.issueFineWeight ? Number(job.issueFineWeight) : 0,
    receiveWeight: job.receiveWeight ? Number(job.receiveWeight) : 0,
    draftOrderNumber: draftOrderNumberByJob.get(job.id) ?? null,
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

/** Highest KAR-<year>-NNNN sequence already used in this store. Max-based,
 * not count-based: a count goes back down after a deletion and would hand
 * out a code that's still in use. */
async function highestKarigarCodeSeq(
  client: Prisma.TransactionClient | typeof prisma,
  storeId: string,
  year: number,
) {
  const existing = await client.karigar.findMany({
    where: { storeId, code: { startsWith: `KAR-${year}-` } },
    select: { code: true },
  });
  return existing.reduce((max, row) => {
    const match = /^KAR-\d{4}-(\d+)$/.exec(row.code ?? "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

function formatKarigarCode(year: number, seq: number) {
  return `KAR-${year}-${String(seq).padStart(4, "0")}`;
}

/** Karigar.code is always system-generated, never typed — one predictable,
 * unique-per-store, human-readable id. */
async function generateKarigarCode(storeId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const year = new Date().getFullYear();
  return formatKarigarCode(year, (await highestKarigarCodeSeq(client, storeId, year)) + 1);
}

/** Another artisan in this store already on file with this mobile — a
 * bulk-imported artisan has no login yet, so the User check alone misses
 * them, and giving their login later would then fail on the duplicate. */
async function findKarigarWithMobile(storeId: string, mobile: string, excludeKarigarId?: string) {
  return prisma.karigar.findFirst({
    where: { storeId, mobile, ...(excludeKarigarId ? { id: { not: excludeKarigarId } } : {}) },
    select: { name: true },
  });
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

    if (data.mobile && (await findKarigarWithMobile(storeId, data.mobile))) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { mobile: ["Another artisan already has this mobile number"] },
      };
    }

    // A location-restricted user may only file an artisan under one of their
    // own locations; with none chosen they get their only location (or must
    // pick one) — otherwise the new artisan would vanish from their own list.
    const locationScope = await getLocationScope();
    if (data.locationId && !isLocationAllowed(locationScope, data.locationId)) {
      return {
        success: false,
        message: "You don't have access to this location",
        errors: { locationId: ["You don't have access to this location"] },
      };
    }
    const locationResolution = await resolveWritableLocationId(storeId, data.locationId, locationScope);
    if (!locationResolution.ok) {
      return {
        success: false,
        message: locationResolution.message,
        errors: { locationId: [locationResolution.message] },
      };
    }
    data.locationId = locationResolution.locationId;

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

    // A mobile or email doubles as the karigar's login — create their User
    // account in the same step, matching how a Store's initial Admin is
    // created alongside the Store itself.
    const karigar = await prisma.$transaction(async (tx) => {
      const code = await generateKarigarCode(storeId, tx);
      const created = await tx.karigar.create({ data: { ...data, code, storeId } });

      if (assignedMetalTypeIds.length > 0) {
        await tx.karigarMetal.createMany({
          data: assignedMetalTypeIds.map((metalTypeId) => ({ karigarId: created.id, metalTypeId })),
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
            karigarId: created.id,
          },
        });
      }

      return created;
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
      // Only createKarigar sets this — lets a caller doing a quick-create
      // (see AddKarigarDialog) pull the new row's id back out without a
      // refetch, same as upsertStoreMetal/upsertStoreMetalPurity's own id.
      id: karigar.id,
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

    // Only judge a mobile this edit changes: two artisans saved with the same
    // number before this check existed must still be editable.
    const storedMobile = (
      await prisma.karigar.findFirst({ where: { id, storeId }, select: { mobile: true } })
    )?.mobile;
    if (
      data.mobile &&
      data.mobile !== storedMobile &&
      (await findKarigarWithMobile(storeId, data.mobile, id))
    ) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { mobile: ["Another artisan already has this mobile number"] },
      };
    }

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
      if (!isLocationAllowed(await getLocationScope(), data.locationId)) {
        return {
          success: false,
          message: "You don't have access to this location",
          errors: { locationId: ["You don't have access to this location"] },
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

/** The template/export dropdown lists, from this store's own masters. A
 * location-restricted user is only offered their own locations. */
async function loadKarigarSheetDropdowns(storeId: string, scope: LocationScope): Promise<Record<string, string[]>> {
  const [metals, locations, states] = await Promise.all([
    prisma.storeMetal.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.storeLocation.findMany({
      where: { storeId, isActive: true, ...(scope.restricted ? { id: { in: scope.locationIds } } : {}) },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    prisma.state.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const names = (rows: { name: string }[]) => rows.map((row) => row.name);

  return {
    State: names(states),
    "GST Type": PARTY_GST_TYPE_OPTIONS.map((option) => option.label),
    "Metal Type": names(metals),
    // A single-value dropdown; several comma-joined names stay typeable
    // (the dropdown only warns).
    "Assigned Metals/Stones": names(metals),
    Location: names(locations),
    Active: ["Yes", "No"],
  };
}

export async function exportKarigarsToExcel(
  params: ExportKarigarsParams,
): Promise<ExportResult> {
  try {
    const { selectedIds, search, sortBy = "createdAt", sortOrder = "desc" } = params;

    const storeId = await requireStoreScope();
    await assertPlanActiveForExport(storeId);
    const scope = await getLocationScope();

    // Without a selection the export follows the list it was started from
    // (the active Artisans list unless `active: false`), the same rule the
    // Parties export uses. A selection exports exactly those rows.
    const where = selectedIds?.length
      ? { id: { in: selectedIds }, storeId, ...locationWhere(scope) }
      : getWhere(storeId, search, scope, params.active ?? true, params.type, params.dateFrom, params.dateTo);

    const karigars = await prisma.karigar.findMany({
      where,
      orderBy: getOrderBy(sortBy, sortOrder),
      include: {
        metalType: { select: { name: true } },
        location: { select: { name: true } },
        assignedMetals: { select: { metalType: { select: { name: true } } } },
      },
    });

    if (!karigars.length) {
      return { success: false, message: "No artisans found to export." };
    }

    // This store's columns only (lib/sheet-features.ts).
    const features = await getSheetFeatures(storeId);
    const exportHeaders = karigarExportHeaders(features);

    // Exactly the import template's columns and value forms (plain numbers,
    // labels, Yes/No), plus read-only Sr No / Artisan Code / Created At the
    // import ignores — so an exported file re-imports as the same artisans.
    const rows = karigars.map((karigar, index) => {
      const values: Record<string, unknown> = {
        "Sr No": index + 1,
        "Artisan Code": karigar.code ?? "",
        Name: karigar.name,
        Mobile: karigar.mobile ?? "",
        WhatsApp: karigar.whatsapp ?? "",
        Email: karigar.email ?? "",
        Address: karigar.address ?? "",
        City: karigar.city ?? "",
        State: karigar.state ?? "",
        Pincode: karigar.pincode ?? "",
        "GST Number": karigar.gstNumber ?? "",
        "GST Type": partyGstTypeLabel(karigar.gstType),
        "PAN Number": karigar.panNumber ?? "",
        "Aadhaar Number": karigar.aadhaarNumber ?? "",
        Specialization: karigar.specialization ?? "",
        "Metal Type": karigar.metalType?.name ?? "",
        "Assigned Metals/Stones": karigar.assignedMetals.map((row) => row.metalType.name).sort().join(", "),
        Location: karigar.location?.name ?? "",
        "Opening Gold (g)": Number(karigar.openingGold ?? 0),
        "Opening Cash": Number(karigar.openingCash ?? 0),
        Notes: karigar.notes ?? "",
        Active: karigar.isActive ? "Yes" : "No",
        "Created At": formatShortDate(karigar.createdAt),
      };
      return pickSheetRow(values, exportHeaders);
    });

    const message = `Exported ${karigars.length} artisan(s) successfully.`;

    if (params.format === "csv") {
      return { success: true, message, ...buildCsvExportBase64(rows, "artisans") };
    }

    if (params.format === "pdf") {
      // A shorter column set: every sheet column on one landscape page left
      // each only a few characters wide. CSV/Excel carry them all.
      const pdfRows = rows.map((row) => ({
        "Sr No": row["Sr No"],
        "Artisan Code": row["Artisan Code"],
        Name: row.Name,
        Mobile: row.Mobile,
        City: row.City,
        "Metal Type": row["Metal Type"],
        ...(features.locations ? { Location: row.Location } : {}),
        "Opening Gold (g)": row["Opening Gold (g)"],
        "Opening Cash": row["Opening Cash"],
        Status: row.Active === "Yes" ? "Active" : "Inactive",
      }));
      return { success: true, message, ...buildPdfExportBase64(pdfRows, "Artisans", "artisans") };
    }

    return {
      success: true,
      message,
      ...buildImportTemplateWithDropdowns({
        sheetName: "Artisans",
        rows,
        columns: exportHeaders,
        dropdowns: dropdownsFor(await loadKarigarSheetDropdowns(storeId, scope), exportHeaders),
        instructions: { notes: KARIGAR_SHEET_NOTES, rows: karigarSheetInstructions(features) },
        filePrefix: "artisans",
      }),
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
 * A downloadable .xlsx with the shared artisan columns (lib/karigars/
 * karigar-sheet.ts), one example row, an Instructions sheet and dropdowns
 * from this store's own metals, locations and states. Artisan Code is never
 * a column — it's auto-generated on import exactly like the "Add Artisan"
 * form generates it.
 */
export async function getKarigarImportTemplate(): Promise<{
  fileName: string;
  fileBase64: string;
}> {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const features = await getSheetFeatures(storeId);
  const headers = karigarSheetHeaders(features);
  const example = Object.fromEntries(karigarSheetColumns(features).map((column) => [column.header, column.example]));

  return buildImportTemplateWithDropdowns({
    sheetName: "Artisans Import",
    rows: [example],
    columns: headers,
    dropdowns: dropdownsFor(await loadKarigarSheetDropdowns(storeId, scope), headers),
    instructions: { notes: KARIGAR_SHEET_NOTES, rows: karigarSheetInstructions(features) },
    filePrefix: "artisans-import-template",
  });
}

/** A GST Type cell: its label (as exported) or the raw enum value. Blank →
 * Not GST Registered; anything else → null (an error). */
function parseKarigarGstType(raw: string): PartyGstType | null {
  if (!raw) return "UNREGISTERED";
  const lower = raw.toLowerCase();
  const match = PARTY_GST_TYPE_OPTIONS.find(
    (option) => option.label.toLowerCase() === lower || option.value.toLowerCase() === lower,
  );
  return match ? (match.value as PartyGstType) : null;
}

/**
 * Bulk-adds artisans from one spreadsheet, with the same checks as the "Add
 * Artisan" form: KYC ids, GSTIN required for a registered artisan, mobile/
 * email unique (within the file, against this store's artisans and against
 * every user's login, so adding a login later can't fail), metals and
 * location from this store, and a location-restricted user only ever files
 * artisans under their own locations. Validates every row with zero writes,
 * then writes everything in one transaction — all or nothing.
 *
 * Deliberately does NOT create a User login for a row's Mobile/Email (unlike
 * the single "Add Artisan" form) — doing that per-row on a bulk import would
 * silently mass-invite/email everyone in the file. A login can be added
 * later by editing the artisan.
 */
export async function importKarigarsFromExcel(
  formData: FormData,
): Promise<KarigarImportResult> {
  try {
    const storeId = await requireStoreScope();
    const scope = await getLocationScope();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return { success: false, message: "Choose a .xlsx or .csv file to import." };
    }

    // A column this store's sheets leave out (Location with no locations set
    // up) is ignored if an older file still has it — never an error.
    const rows = stripHiddenSheetColumns(
      parseExcelUpload(await file.arrayBuffer()),
      karigarHiddenHeaders(await getSheetFeatures(storeId)),
    );

    if (!rows.length) {
      return { success: false, message: "That file has no rows to import." };
    }

    const [metals, locations, settings] = await Promise.all([
      prisma.storeMetal.findMany({ where: { storeId }, select: { id: true, name: true } }),
      prisma.storeLocation.findMany({ where: { storeId }, select: { id: true, name: true } }),
      getBusinessSettings(),
    ]);

    const metalByName = new Map(metals.map((m) => [m.name.trim().toLowerCase(), m]));
    const locationByName = new Map(locations.map((l) => [l.name.trim().toLowerCase(), l.id]));
    // What a blank Location means for this user — the same rule the form
    // applies (resolveWritableLocationId): none when unrestricted, their only
    // location when they have one, otherwise they must name one.
    const blankLocation = await resolveWritableLocationId(storeId, null, scope);

    // Contact values already taken, checked in two batched queries rather
    // than per row.
    const fileMobiles = rows.map((row) => karigarSheetCell(row, "Mobile")).filter(Boolean);
    const fileEmails = rows.map((row) => karigarSheetCell(row, "Email")).filter(Boolean);
    const [karigarsWithMobile, usersWithContact] = await Promise.all([
      fileMobiles.length
        ? prisma.karigar.findMany({ where: { storeId, mobile: { in: fileMobiles } }, select: { mobile: true, name: true, code: true } })
        : Promise.resolve([]),
      fileMobiles.length || fileEmails.length
        ? prisma.user.findMany({
            where: {
              OR: [
                ...(fileMobiles.length ? [{ phone: { in: fileMobiles } }] : []),
                ...(fileEmails.length ? [{ email: { in: fileEmails } }] : []),
              ],
            },
            select: { phone: true, email: true },
          })
        : Promise.resolve([]),
    ]);
    const karigarByMobile = new Map(karigarsWithMobile.map((k) => [k.mobile as string, k]));
    const metalCandidates = namesAsCandidates(metals.map((m) => m.name));
    const locationCandidates = namesAsCandidates(locations.map((l) => l.name));
    const userPhones = new Set(usersWithContact.map((u) => u.phone).filter(Boolean) as string[]);
    const userEmails = new Set(usersWithContact.map((u) => u.email?.toLowerCase()).filter(Boolean) as string[]);
    const firstLineByMobile = new Map<string, number>();
    const firstLineByEmail = new Map<string, number>();

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
      const cell = (header: string) => karigarSheetCell(row, header);

      const name = cell("Name");
      if (!name) rowErrors.push("Name is required");

      const mobile = cell("Mobile");
      if (mobile) {
        const earlier = firstLineByMobile.get(mobile);
        if (earlier) rowErrors.push(`Mobile ${mobile} is repeated in this file${earlierRowHint(earlier)}`);
        else firstLineByMobile.set(mobile, line);
        const owner = karigarByMobile.get(mobile);
        if (owner) {
          rowErrors.push(
            `Mobile ${mobile} already belongs to an artisan${existingRecordHint(
              { name: owner.name, ref: owner.code },
              "Remove this row, or edit that artisan instead",
            )}`,
          );
        }
        else if (userPhones.has(mobile)) rowErrors.push(`Mobile ${mobile} is already in use as another user's login`);
      }

      const email = cell("Email");
      if (email) {
        const key = email.toLowerCase();
        const earlier = firstLineByEmail.get(key);
        if (earlier) rowErrors.push(`Email ${email} is repeated in this file${earlierRowHint(earlier)}`);
        else firstLineByEmail.set(key, line);
        if (userEmails.has(key)) rowErrors.push(`Email ${email} is already in use as another user's login`);
      }

      const aadhaarNumber = cell("Aadhaar Number");
      if (aadhaarNumber && !isValidAadhaarNumber(aadhaarNumber)) {
        rowErrors.push(AADHAAR_INVALID_MESSAGE);
      }

      const panNumber = cell("PAN Number");
      if (panNumber && !isValidPanNumber(panNumber)) {
        rowErrors.push(PAN_INVALID_MESSAGE);
      }

      const rawGstType = cell("GST Type");
      const gstType = parseKarigarGstType(rawGstType);
      if (!gstType) {
        rowErrors.push(`GST Type "${rawGstType}" isn't one of ${PARTY_GST_TYPE_OPTIONS.map((o) => o.label).join(", ")}`);
      }
      const gstNumber = cell("GST Number");
      if (gstType && !gstNumber && gstinRequired(settings.gstScheme, gstType)) {
        rowErrors.push(`GST Number is required for a ${partyGstTypeLabel(gstType)} artisan`);
      }

      const metalName = cell("Metal Type");
      const metal = metalName ? metalByName.get(metalName.toLowerCase()) : undefined;
      if (metalName && !metal) {
        rowErrors.push(`No metal type found named "${metalName}"${suggestFrom(metalName, metalCandidates)}`);
      }

      // A Set, like the form's checkboxes: "Gold, gold" assigns Gold once.
      const assignedMetalTypeIds = new Set<string>();
      for (const rawName of cell("Assigned Metals/Stones").split(",")) {
        const trimmed = rawName.trim();
        if (!trimmed) continue;
        const assigned = metalByName.get(trimmed.toLowerCase());
        if (!assigned) rowErrors.push(`No metal/stone found named "${trimmed}"${suggestFrom(trimmed, metalCandidates)}`);
        else assignedMetalTypeIds.add(assigned.id);
      }

      const locationName = cell("Location");
      let locationId: string | null = null;
      if (locationName) {
        locationId = locationByName.get(locationName.toLowerCase()) ?? null;
        if (!locationId) rowErrors.push(`No location found named "${locationName}"${suggestFrom(locationName, locationCandidates)}`);
        else if (!isLocationAllowed(scope, locationId)) {
          rowErrors.push(`You don't have access to location "${locationName}"`);
        }
      } else if (blankLocation.ok) {
        locationId = blankLocation.locationId;
      } else {
        rowErrors.push("Location is required — enter one of your locations");
      }

      const rawOpeningGold = cell("Opening Gold (g)");
      const openingGold = parseKarigarSheetNumber(rawOpeningGold);
      if (openingGold === null) rowErrors.push(`Opening Gold (g) "${rawOpeningGold}" must be a number`);

      const rawOpeningCash = cell("Opening Cash");
      const openingCash = parseKarigarSheetNumber(rawOpeningCash);
      if (openingCash === null) rowErrors.push(`Opening Cash "${rawOpeningCash}" must be a number`);

      const rawActive = cell("Active");
      const isActive = parseKarigarSheetYesNo(rawActive, true);
      if (isActive === null) rowErrors.push(`Active "${rawActive}" must be Yes or No`);

      if (rowErrors.length > 0) {
        for (const message of rowErrors) errors.push(`Row ${line}: ${message}`);
        continue;
      }

      resolvedRows.push({
        fields: {
          name,
          mobile: mobile || null,
          whatsapp: cell("WhatsApp") || null,
          email: email || null,
          address: cell("Address") || null,
          city: cell("City") || null,
          state: cell("State") || null,
          pincode: cell("Pincode") || null,
          gstNumber: gstNumber || null,
          gstType: gstType!,
          panNumber: panNumber ? normalizePanNumber(panNumber) : null,
          aadhaarNumber: aadhaarNumber ? normalizeAadhaarNumber(aadhaarNumber) : null,
          specialization: cell("Specialization") || null,
          notes: cell("Notes") || null,
          openingGold: openingGold!,
          openingCash: openingCash!,
          isActive: isActive!,
          locationId,
          metalTypeId: metal?.id ?? null,
        },
        assignedMetalTypeIds: [...assignedMetalTypeIds],
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

    // One transaction: the artisans, their codes and their assigned metals
    // all land together or not at all.
    const createdCount = await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      let highestSeq = await highestKarigarCodeSeq(tx, storeId, year);

      const toCreate: Prisma.KarigarCreateManyInput[] = resolvedRows.map((row) => {
        highestSeq += 1;
        return { storeId, code: formatKarigarCode(year, highestSeq), ...row.fields };
      });

      const created = await tx.karigar.createManyAndReturn({
        data: toCreate,
        select: { id: true, code: true },
      });
      const karigarIdByCode = new Map(created.map((k) => [k.code, k.id]));

      const karigarMetalRows: Prisma.KarigarMetalCreateManyInput[] = toCreate.flatMap((row, index) => {
        const karigarId = karigarIdByCode.get(row.code!);
        if (!karigarId) throw new Error(`Created artisan ${row.code} not returned`);
        return resolvedRows[index].assignedMetalTypeIds.map((metalTypeId) => ({ karigarId, metalTypeId }));
      });

      if (karigarMetalRows.length) {
        await tx.karigarMetal.createMany({ data: karigarMetalRows });
      }

      return toCreate.length;
    });

    revalidatePath("/karigars");
    revalidatePath("/karigars/disabled");

    return {
      success: true,
      message: `Added ${createdCount} ${createdCount === 1 ? "artisan" : "artisans"}.`,
      createdCount,
    };
  } catch (error) {
    logger.error("importKarigarsFromExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to import artisans.") };
  }
}
