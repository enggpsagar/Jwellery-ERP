// lib/actions/quotation-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  InvoiceStatus,
  InventoryStockStatus,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
  PurityType,
  Prisma,
  ChargeType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeRoundOff } from "@/lib/round-off";
import { requirePermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context";
import { actionErrorMessage } from "@/lib/action-error";
import { resolveGstRateSnapshot } from "@/lib/actions/gst-rate-actions";
import {
  getLocationScope,
  locationWhere,
  isLocationAllowed,
  resolveWritableLocationId,
  type LocationScope,
} from "@/lib/location-scope";
import { buildExcelExport, buildCsvExportBase64, buildPdfExportBase64 } from "@/lib/excel-export";
import { formatShortDate } from "@/lib/utils";
import { computeGst } from "@/lib/gst";
import type {
  DataTableExportParams,
  DataTableExportResult,
} from "@/components/shared/data-table-toolbar";
import { logger } from "@/lib/logger";
import { parseDateRangeBoundary } from "@/lib/date-range";

export type QuotationLineItemInput = {
  itemName: string;
  metalTypeId?: string | null;
  purity?: PurityType | null;
  purityLabel?: string | null;
  quantity: number;
  grossWeight?: number | null;
  netWeight?: number | null;
  stoneWeight?: number | null;
  caratWeight?: number | null;
  rate?: number | null;
  makingCharge: number;
  makingChargeType?: ChargeType | string | null;
  stoneCharge: number;
  stoneRate?: number | null;
  stoneMetalTypeName?: string | null;
  stoneTypeNames?: string | null;
  // Hallmarking charge, folded into the quotation's Making Charges total —
  // same convention as InvoiceLineItemInput.hmCharge's own doc comment.
  hmCharge?: number;
  inventoryStockId?: string | null;
};

export type QuotationFormState = {
  success: boolean;
  message: string;
  quotationId?: string;
  invoiceId?: string;
};

const initialState: QuotationFormState = { success: false, message: "" };

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

/** Never trust client input for the making-charge mode — anything other
 * than a valid ChargeType falls back to FIXED. */
function toChargeType(value: unknown): ChargeType {
  return value === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
}

/**
 * Diamond items price per carat, not per gram — every other purity still
 * prices off netWeight. Net Weight/Carat Weight is a per-piece figure (see
 * Product.defaultNetWeight and product-form.tsx's own "prefill" comment),
 * so the actual priced quantity is that per-piece weight times how many
 * pieces (item.quantity) — this used to ignore quantity entirely, pricing
 * every line as if exactly one piece were being bought no matter what
 * Quantity said. Duplicated per action file (same convention as the
 * generateXNumber helpers in this codebase) rather than a shared import.
 */
function lineQuantity(item: {
  purity?: PurityType | null;
  netWeight?: number | null;
  caratWeight?: number | null;
  quantity?: number | null;
}) {
  const perPiece = item.purity === PurityType.DIAMOND ? toNumber(item.caratWeight) : toNumber(item.netWeight);
  return perPiece * (toNumber(item.quantity, 1) || 1);
}

function lineTotal(item: QuotationLineItemInput) {
  const metalValue = toNumber(item.rate) * lineQuantity(item);
  return (
    metalValue + toNumber(item.makingCharge) + toNumber(item.hmCharge) + toNumber(item.stoneCharge)
  );
}

/**
 * Once a line item is linked to an InventoryStock row, every field
 * describing what the piece physically IS (name, metal, purity, weights,
 * embedded stone) becomes read-only in the form — sourced from that stock
 * record, only quantity/rate/charges stay editable. A disabled <input> is
 * only a UI courtesy: a direct/tampered POST can still submit any value it
 * wants for a "locked" field, so this overwrites those fields from the
 * trusted InventoryStock row before anything else reads them. Same pattern
 * as purchase-actions.ts's lockLinkedProductFields, but simpler — Quotation
 * links to InventoryStock (nullable, no placeholder-substitution complexity
 * like Purchase's non-nullable Product FK) rather than Product directly,
 * and QuotationItem has no hsnCode column at all (the UI never wired one
 * up), so unlike Purchase's set this one leaves HSN out entirely. Items
 * with no inventoryStockId are a genuinely manual line and pass through
 * unchanged.
 */
async function lockLinkedStockFields(
  storeId: string,
  items: QuotationLineItemInput[],
  explicitStockIds: ReadonlySet<string>,
): Promise<QuotationLineItemInput[]> {
  if (explicitStockIds.size === 0) return items;

  const stockRows = await prisma.inventoryStock.findMany({
    where: { id: { in: [...explicitStockIds] }, storeId },
    select: {
      id: true,
      metalTypeId: true,
      purity: true,
      purityLabel: true,
      grossWeight: true,
      netWeight: true,
      caratWeight: true,
      stoneWeight: true,
      stoneMetalTypeName: true,
      stoneTypeNames: true,
      product: { select: { name: true } },
    },
  });
  const stockById = new Map(stockRows.map((stock) => [stock.id, stock]));

  return items.map((item) => {
    if (!item.inventoryStockId) return item;
    const stock = stockById.get(item.inventoryStockId);
    if (!stock) return item;

    return {
      ...item,
      itemName: stock.product.name,
      metalTypeId: stock.metalTypeId,
      purity: stock.purity,
      purityLabel: stock.purityLabel,
      grossWeight: stock.grossWeight ? Number(stock.grossWeight) : null,
      netWeight: stock.netWeight ? Number(stock.netWeight) : null,
      caratWeight: stock.caratWeight ? Number(stock.caratWeight) : null,
      stoneWeight: stock.stoneWeight ? Number(stock.stoneWeight) : null,
      stoneMetalTypeName: stock.stoneMetalTypeName,
      stoneTypeNames: stock.stoneTypeNames,
    };
  });
}

async function generateQuotationNumber(storeId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.quotation.count({
    where: {
      storeId,
      quotationNumber: { startsWith: `QTN-${year}-` },
    },
  });

  return `QTN-${year}-${String(count + 1).padStart(4, "0")}`;
}

/** Duplicated from invoice-actions.ts's generateInvoiceNumber — numbering
 * helpers are per-file in this codebase, not shared. */
async function generateInvoiceNumber(storeId: string) {
  const settings = await prisma.businessSettings.findUnique({ where: { storeId } });
  const prefix = settings?.invoicePrefix?.trim() || "INV";
  const startingNo = settings?.invoiceStartingNo ?? 1;
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: {
      storeId,
      invoiceNumber: { startsWith: `${prefix}-${year}-` },
    },
  });

  return `${prefix}-${year}-${String(count + startingNo).padStart(4, "0")}`;
}

function mapQuotation(quotation: any) {
  return {
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    quotationDate: quotation.quotationDate.toISOString(),
    validUntil: quotation.validUntil?.toISOString() ?? null,
    status: quotation.status as string,
    subtotal: Number(quotation.subtotal),
    makingCharges: Number(quotation.makingCharges),
    stoneCharges: Number(quotation.stoneCharges),
    discount: Number(quotation.discount),
    taxAmount: Number(quotation.taxAmount),
    // Document-level tax split — Quotation never broke tax into components
    // per line the way Invoice/InvoiceItem does, so these live only here.
    // Needed by the print templates' single GST summary line (see
    // components/quotations/quotation-print-*.tsx).
    sgstAmount: Number(quotation.sgstAmount ?? 0),
    cgstAmount: Number(quotation.cgstAmount ?? 0),
    igstAmount: Number(quotation.igstAmount ?? 0),
    gstRateId: quotation.gstRateId ?? null,
    gstRateName: quotation.gstRateName ?? null,
    gstRatePercent: quotation.gstRatePercent != null ? Number(quotation.gstRatePercent) : null,
    // Signed adjustment computeRoundOff() applied to reach totalAmount —
    // see that helper's doc comment. Persisted at create time, just read
    // back here rather than recomputed, so a saved document's Total never
    // drifts if the rounding rule ever changes.
    roundOffAmount: Number(quotation.roundOffAmount ?? 0),
    totalAmount: Number(quotation.totalAmount),
    notes: quotation.notes,
    convertedToId: quotation.convertedToId,
    customer: quotation.customer
      ? {
          id: quotation.customer.id,
          name: quotation.customer.name,
          phone: quotation.customer.phone,
          // Only populated when getQuotationById's own customer select asks
          // for these (the list-view getQuotations select doesn't) — the
          // print page's Bill To block is the one consumer that needs them.
          addressLine1: quotation.customer.addressLine1 ?? null,
          addressLine2: quotation.customer.addressLine2 ?? null,
          city: quotation.customer.city ?? null,
          state: quotation.customer.state ?? null,
          pincode: quotation.customer.pincode ?? null,
        }
      : null,
    convertedTo: quotation.convertedTo
      ? {
          id: quotation.convertedTo.id,
          invoiceNumber: quotation.convertedTo.invoiceNumber,
        }
      : null,
    items: (quotation.items ?? []).map((item: any) => ({
      id: item.id,
      itemName: item.itemName,
      metalTypeId: item.metalTypeId,
      purity: item.purity,
      purityLabel: item.purityLabel,
      quantity: item.quantity,
      grossWeight: item.grossWeight ? Number(item.grossWeight) : null,
      netWeight: item.netWeight ? Number(item.netWeight) : null,
      stoneWeight: item.stoneWeight ? Number(item.stoneWeight) : null,
      caratWeight: item.caratWeight ? Number(item.caratWeight) : null,
      rate: item.rate ? Number(item.rate) : null,
      makingCharge: Number(item.makingCharge),
      makingChargeType: item.makingChargeType as ChargeType,
      stoneCharge: Number(item.stoneCharge),
      stoneRate: item.stoneRate ? Number(item.stoneRate) : null,
      stoneMetalTypeName: item.stoneMetalTypeName ?? null,
      stoneTypeNames: item.stoneTypeNames ?? null,
      hmCharge: Number(item.hmCharge ?? 0),
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
    })),
  };
}

export type QuotationSortBy = "quotationDate" | "quotationNumber" | "totalAmount";

function buildQuotationsWhere(
  storeId: string,
  params: { search?: string; status?: string | "ALL"; dateFrom?: string; dateTo?: string },
  scope: LocationScope,
) {
  const search = String(params.search || "").trim();
  const status = params.status && params.status !== "ALL" ? params.status : undefined;
  const dateFrom = parseDateRangeBoundary(params.dateFrom, false);
  const dateTo = parseDateRangeBoundary(params.dateTo, true);

  return {
    storeId,
    ...locationWhere(scope),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? { quotationDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { quotationNumber: { contains: search, mode: "insensitive" as const } },
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

function buildQuotationsOrderBy(
  sortBy: QuotationSortBy,
  sortOrder: "asc" | "desc",
): Prisma.QuotationOrderByWithRelationInput {
  return { [sortBy]: sortOrder } as Prisma.QuotationOrderByWithRelationInput;
}

export type GetQuotationsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string | "ALL";
  sortBy?: QuotationSortBy;
  sortOrder?: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
};

export async function getQuotations(params: GetQuotationsParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const sortBy = params.sortBy || "quotationDate";
  const sortOrder = params.sortOrder || "desc";

  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const where = buildQuotationsWhere(storeId, params, scope);

  const [totalCount, quotations] = await Promise.all([
    prisma.quotation.count({ where }),
    prisma.quotation.findMany({
      where,
      orderBy: buildQuotationsOrderBy(sortBy, sortOrder),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        convertedTo: { select: { id: true, invoiceNumber: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    quotations: quotations.map(mapQuotation),
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

const QUOTATION_SORT_FIELDS = ["quotationDate", "quotationNumber", "totalAmount"] as const;

function toQuotationSortBy(value: string | undefined): QuotationSortBy {
  return (QUOTATION_SORT_FIELDS as readonly string[]).includes(value ?? "")
    ? (value as QuotationSortBy)
    : "quotationDate";
}

/** Exports either an explicit set of quotations (selectedIds) or the current
 * search/status/sort-filtered list (mirrors getQuotations' own filtering so
 * "export filtered results" matches exactly what's on screen). Quotation
 * status is a plain string (open/converted/expired), not an enum, so unlike
 * purchases' status it needs no allow-list validation before use in `where`. */
export async function exportQuotationsToExcel(
  params: DataTableExportParams = {},
): Promise<DataTableExportResult> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.QUOTATION_VIEW);
    } catch {
      return { success: false, message: "You do not have permission to export quotations." };
    }

    const storeId = await requireStoreScope();
    const scope = await getLocationScope();
    const sortBy = toQuotationSortBy(params.sortBy);
    const sortOrder = params.sortOrder || "desc";

    const where =
      params.selectedIds && params.selectedIds.length > 0
        ? { id: { in: params.selectedIds }, storeId, ...locationWhere(scope) }
        : buildQuotationsWhere(storeId, { search: params.search, status: params.status, dateFrom: params.dateFrom, dateTo: params.dateTo }, scope);

    const quotations = await prisma.quotation.findMany({
      where,
      orderBy: buildQuotationsOrderBy(sortBy, sortOrder),
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        convertedTo: { select: { id: true, invoiceNumber: true } },
      },
    });

    if (!quotations.length) {
      return { success: false, message: "No quotations found to export." };
    }

    const rows = quotations.map(mapQuotation).map((quotation, index) => ({
      "Sr. No.": index + 1,
      "Quotation Number": quotation.quotationNumber,
      Date: formatShortDate(quotation.quotationDate),
      "Valid Until": quotation.validUntil ? formatShortDate(quotation.validUntil) : "",
      Party: quotation.customer?.name || "",
      Status: quotation.status,
      Subtotal: quotation.subtotal,
      "Making Charges": quotation.makingCharges,
      "Stone Charges": quotation.stoneCharges,
      Discount: quotation.discount,
      "Tax Amount": quotation.taxAmount,
      "Total Amount": quotation.totalAmount,
      "Converted To Invoice": quotation.convertedTo?.invoiceNumber || "",
    }));

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "quotations")
        : params.format === "pdf"
          ? buildPdfExportBase64(rows, "Quotations", "quotations")
          : buildExcelExport(rows, "Quotations", "quotations");

    return {
      success: true,
      message: "Quotations exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    logger.error("exportQuotationsToExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to export quotations.") };
  }
}

export async function getQuotationById(id: string) {
  const storeId = await getStoreIdForRead();

  const quotation = await prisma.quotation.findFirst({
    where: { id, storeId },
    include: {
      // Address fields ride along here (unlike getQuotations'/
      // exportQuotationsToExcel's lighter customer select) so the print
      // page's Bill To block can show a full address, same as Invoice's.
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          pincode: true,
        },
      },
      items: true,
      convertedTo: { select: { id: true, invoiceNumber: true } },
    },
  });

  if (!quotation) return null;
  return mapQuotation(quotation);
}

export type Quotation = NonNullable<Awaited<ReturnType<typeof getQuotationById>>>;

/** Lightweight customer list for the quotation form's customer picker. */
export async function getQuotationFormCustomers() {
  const storeId = await requireStoreScope();

  const customers = await prisma.customer.findMany({
    where: { storeId, isActive: true, isArchived: false },
    orderBy: { name: "asc" },
    // `state` rides along so the form can tell an inter-state sale from an
    // intra-state one (computeGst's isInterState) without a second round trip.
    select: { id: true, name: true, phone: true, customerCode: true, state: true },
  });

  return customers;
}

/** In-stock items available to optionally attach to a quotation line item. */
export async function getQuotationFormStockItems() {
  const storeId = await requireStoreScope();

  const stockItems = await prisma.inventoryStock.findMany({
    // Same fix as getInvoiceFormStockItems (invoice-actions.ts) — Stock has
    // no Active/Inactive concept of its own; availability is purely
    // quantity-driven.
    where: { storeId, status: InventoryStockStatus.IN_STOCK, quantity: { gt: 0 } },
    orderBy: { stockCode: "asc" },
    include: {
      product: {
        select: {
          name: true,
          productCode: true,
          // See getInvoiceFormStockItems's identical comment
          // (invoice-actions.ts) / resolveStockSellingRate (lib/purity.ts).
          storeMetalPurityId: true,
          storeMetalPurity: { select: { sellingPrice: true } },
          stoneOriginOptionId: true,
          stoneOriginOption: { select: { sellingPrice: true } },
        },
      },
      metalType: { select: { id: true, name: true } },
    },
  });

  return stockItems.map((stock) => ({
    id: stock.id,
    stockCode: stock.stockCode,
    productName: stock.product.name,
    productCode: stock.product.productCode,
    metalType: stock.metalType,
    purity: stock.purity,
    purityLabel: stock.purityLabel,
    grossWeight: stock.grossWeight ? Number(stock.grossWeight) : null,
    netWeight: stock.netWeight ? Number(stock.netWeight) : null,
    caratWeight: stock.caratWeight ? Number(stock.caratWeight) : null,
    stoneRate: stock.stoneRate ? Number(stock.stoneRate) : null,
    stoneMetalTypeName: stock.stoneMetalTypeName ?? null,
    stoneTypeNames: stock.stoneTypeNames ?? null,
    saleRate: stock.saleRate ? Number(stock.saleRate) : null,
    storeMetalPurityRate:
      stock.product.storeMetalPurity?.sellingPrice != null
        ? Number(stock.product.storeMetalPurity.sellingPrice)
        : null,
    stoneOriginRate:
      stock.product.stoneOriginOption?.sellingPrice != null
        ? Number(stock.product.stoneOriginOption.sellingPrice)
        : null,
  }));
}

/**
 * Create a quotation with its line items in one transaction. A quotation is
 * a pure proposal — it never touches stock or the ledger; those side
 * effects only happen when it's converted to an Invoice.
 */
export async function createQuotation(
  prevState: QuotationFormState = initialState,
  formData: FormData,
): Promise<QuotationFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.QUOTATION_CREATE);
    } catch {
      return { success: false, message: "You do not have permission to create quotations." };
    }

    const customerId = String(formData.get("customerId") || "");
    const locationId = String(formData.get("locationId") || "").trim() || null;
    const itemsRaw = String(formData.get("itemsJson") || "[]");

    if (!customerId) {
      return { success: false, message: "Please select a party" };
    }

    let items: QuotationLineItemInput[] = [];
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return { success: false, message: "Invalid line items" };
    }

    if (!items.length) {
      return { success: false, message: "Add at least one line item" };
    }

    // Resolved early (this action used to only need it much later, right
    // before the DB write) so it's available for lockLinkedStockFields
    // below — which itself must run before any total/subtotal is computed
    // from `items`, since a Quotation's subtotal is priced off Net/Carat
    // Weight (see lineQuantity) and a tampered POST could otherwise still
    // submit its own weight for a "locked" field.
    const storeId = await requireStoreScope();

    // Captured directly off the freshly-parsed items, before anything else
    // touches them — Quotation's inventoryStockId is nullable (a manual
    // line legitimately has none), so unlike Purchase there's no
    // placeholder-substitution step to worry about jumbling this with.
    const explicitStockIds = new Set(
      items.map((item) => item.inventoryStockId).filter((id): id is string => !!id),
    );

    items = await lockLinkedStockFields(storeId, items, explicitStockIds);

    const discount = toNumber(formData.get("discount"));
    const taxAmount = toNumber(formData.get("taxAmount"));
    // Computed client-side by computeGst() (lib/gst.ts) — sgst+cgst on an
    // intra-state quote, igst alone on an inter-state one, never both. Kept
    // as three separate columns (mirroring Invoice/Purchase) even though
    // Quotation only ever needed a document-level total before.
    const sgstAmount = toNumber(formData.get("sgstAmount"));
    const cgstAmount = toNumber(formData.get("cgstAmount"));
    const igstAmount = toNumber(formData.get("igstAmount"));
    const gstRateId = String(formData.get("gstRateId") || "").trim() || null;
    const quotationDateRaw = String(formData.get("quotationDate") || "");
    const validUntilRaw = String(formData.get("validUntil") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.rate) * lineQuantity(item),
      0,
    );
    // Hallmarking charge folds into the quotation's Making Charges total —
    // same convention as invoice-actions.ts's own makingCharges.
    const makingCharges = items.reduce(
      (sum, item) => sum + toNumber(item.makingCharge) + toNumber(item.hmCharge),
      0,
    );
    const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
    const rawTotal = subtotal + makingCharges + stoneCharges - discount + taxAmount;
    // Standard Indian-billing "Round Off" — see computeRoundOff's own doc
    // comment. Server-derived only: the client never submits a round-off
    // value, it just previews the same computation.
    const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal);

    // Re-resolved against the store's own current GstRate row rather than
    // trusted from the client — see resolveGstRateSnapshot's own doc
    // comment. A missing/invalid id (e.g. a Composition-scheme document,
    // which never selects a rate) just leaves the snapshot null instead of
    // failing the save.
    const gstRateSnapshot = await resolveGstRateSnapshot(storeId, gstRateId);

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true },
    });
    if (!customer) {
      return { success: false, message: "Please select a party" };
    }

    // A Composition-scheme store is legally barred from charging any GST at
    // all — see GstScheme's doc comment and computeGst() in lib/gst.ts,
    // which the form is expected to have already zeroed these against.
    // Enforced again here because a server action is reachable independent
    // of whatever the form's own UI disabled.
    const businessSettings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { gstScheme: true },
    });
    if (
      businessSettings?.gstScheme === "COMPOSITION" &&
      (sgstAmount !== 0 || cgstAmount !== 0 || igstAmount !== 0 || taxAmount !== 0)
    ) {
      return {
        success: false,
        message: "This store is on the Composition Scheme and cannot charge GST on a quotation.",
      };
    }

    // Every referenced stock item must belong to this store — otherwise a
    // crafted itemsJson could link a line item to another store's stock.
    const requestedStockIds = [
      ...new Set(items.map((item) => item.inventoryStockId).filter((id): id is string => !!id)),
    ];
    const validStock = requestedStockIds.length
      ? await prisma.inventoryStock.findMany({
          where: { id: { in: requestedStockIds }, storeId },
          select: { id: true },
        })
      : [];
    const validStockIds = new Set(validStock.map((s) => s.id));

    // See resolveWritableLocationId's own doc comment — without this, a
    // location-restricted Staff user submitting no location at all saved
    // the quotation with locationId: null, which then never matches their
    // own location-scoped list afterward.
    const locationScope = await getLocationScope();
    const locationResolution = await resolveWritableLocationId(storeId, locationId, locationScope);
    if (!locationResolution.ok) {
      return { success: false, message: locationResolution.message };
    }
    const resolvedLocationId = locationResolution.locationId;

    const quotationNumber = await generateQuotationNumber(storeId);

    const quotation = await prisma.quotation.create({
      data: {
        storeId,
        quotationNumber,
        customerId,
        quotationDate: quotationDateRaw ? new Date(quotationDateRaw) : new Date(),
        validUntil: validUntilRaw ? new Date(validUntilRaw) : undefined,
        status: "open",
        subtotal,
        makingCharges,
        stoneCharges,
        discount,
        taxAmount,
        sgstAmount,
        cgstAmount,
        igstAmount,
        roundOffAmount,
        totalAmount,
        notes,
        locationId: resolvedLocationId ?? undefined,
        gstRateId: gstRateSnapshot?.gstRateId ?? undefined,
        gstRateName: gstRateSnapshot?.gstRateName ?? undefined,
        gstRatePercent: gstRateSnapshot?.gstRatePercent ?? undefined,
        items: {
          create: items.map((item) => ({
            itemName: item.itemName,
            metalTypeId: item.metalTypeId ?? undefined,
            purity: item.purity ?? undefined,
            purityLabel: item.purityLabel ?? undefined,
            quantity: item.quantity || 1,
            grossWeight: item.grossWeight ?? undefined,
            netWeight: item.netWeight ?? undefined,
            stoneWeight: item.stoneWeight ?? undefined,
            caratWeight: item.caratWeight ?? undefined,
            rate: item.rate ?? undefined,
            makingCharge: item.makingCharge,
            makingChargeType: toChargeType(item.makingChargeType),
            stoneCharge: item.stoneCharge,
            stoneRate: item.stoneRate ?? undefined,
            stoneMetalTypeName: item.stoneMetalTypeName ?? undefined,
            stoneTypeNames: item.stoneTypeNames ?? undefined,
            hmCharge: item.hmCharge ?? 0,
            lineTotal: lineTotal(item),
            inventoryStockId:
              item.inventoryStockId && validStockIds.has(item.inventoryStockId)
                ? item.inventoryStockId
                : undefined,
          })),
        },
      },
    });

    revalidatePath("/quotations");

    return {
      success: true,
      message: `Quotation ${quotationNumber} created`,
      quotationId: quotation.id,
    };
  } catch (error) {
    logger.error("createQuotation error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to create quotation") };
  }
}

/** Only "open" quotations (never converted) can be deleted. */
/**
 * Metadata-only edit — Quotation Date, Valid Until, Notes. Never the
 * customer or line items: those still need the real create flow. Safe to
 * allow even a bit more broadly than Invoice/Purchase's equivalent dialogs
 * since a quotation is a pure proposal — it never touches stock or the
 * ledger (see convertQuotationToInvoice's own comment on that) — but kept
 * to the same metadata scope for consistency with every other document's
 * edit dialog in this app. Only allowed while still "open", same as
 * deleteQuotation.
 */
export async function updateQuotation(
  id: string,
  prevState: QuotationFormState = initialState,
  formData: FormData,
): Promise<QuotationFormState> {
  try {
    const storeId = await requireStoreScope();

    const quotation = await prisma.quotation.findFirst({ where: { id, storeId } });
    if (!quotation) return { success: false, message: "Quotation not found" };
    if (quotation.status !== "open") {
      return { success: false, message: "Only open quotations can be edited" };
    }

    const quotationDateRaw = String(formData.get("quotationDate") || "");
    if (!quotationDateRaw) return { success: false, message: "Quotation Date is required" };

    const validUntilRaw = String(formData.get("validUntil") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    await prisma.quotation.update({
      where: { id },
      data: {
        quotationDate: new Date(quotationDateRaw),
        validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
        notes,
      },
    });

    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);

    return { success: true, message: "Quotation updated" };
  } catch (error) {
    logger.error("updateQuotation error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update quotation") };
  }
}

export async function deleteQuotation(id: string): Promise<QuotationFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.QUOTATION_DELETE);
    } catch {
      return { success: false, message: "You do not have permission to delete quotations." };
    }

    const storeId = await requireStoreScope();

    const quotation = await prisma.quotation.findFirst({ where: { id, storeId } });

    if (!quotation) return { success: false, message: "Quotation not found" };

    if (quotation.status !== "open") {
      return {
        success: false,
        message: "Only open quotations can be deleted",
      };
    }

    await prisma.quotation.delete({ where: { id } });
    revalidatePath("/quotations");

    return { success: true, message: "Quotation deleted" };
  } catch (error) {
    logger.error("deleteQuotation error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to delete quotation") };
  }
}

export type BulkDeleteResult = {
  deletedCount: number;
  failures: { id: string; message: string }[];
};

/**
 * Deletes each selected quotation through the exact same deleteQuotation()
 * call a single-row delete uses — never a bare deleteMany — so a bulk
 * selection can't bypass the "only open quotations can be deleted" guard
 * just because several rows were ticked at once. Partial success is
 * expected and reported per row, not treated as a whole-batch failure.
 */
export async function bulkDeleteQuotations(ids: string[]): Promise<BulkDeleteResult> {
  const failures: BulkDeleteResult["failures"] = [];
  let deletedCount = 0;

  for (const id of ids) {
    const result = await deleteQuotation(id);
    if (result.success) {
      deletedCount++;
    } else {
      failures.push({ id, message: result.message });
    }
  }

  return { deletedCount, failures };
}

/**
 * Convert an open quotation into a real Invoice. Unlike Kacha→Pakka
 * conversion (which is a paperwork upgrade over a sale that already
 * happened), a Quotation is a pure proposal that never touched stock or
 * the ledger — so this is where the actual sale happens: stock linked to
 * quotation items flips to SOLD, a SALE InventoryTransaction is logged for
 * each, and a DEBIT LedgerEntry is recorded for any balance due. Tax and
 * "paid now" are fresh inputs on the convert form since a quotation has
 * neither concept.
 */
export async function convertQuotationToInvoice(
  quotationId: string,
  prevState: QuotationFormState = initialState,
  formData: FormData,
): Promise<QuotationFormState> {
  try {
    // Gated on billing rather than quotations: this is the point the sale
    // actually happens — stock flips to SOLD and the ledger is posted — so
    // being allowed to raise a quote must not be enough to invoice one.
    let actor;
    try {
      actor = await requirePermission(PERMISSIONS.BILLING_CREATE);
    } catch {
      return {
        success: false,
        message: "You do not have permission to create invoices.",
      };
    }

    const storeId = await requireStoreScope();

    const quotation = await prisma.quotation.findFirst({
      where: { id: quotationId, storeId },
      include: { items: true, customer: { select: { state: true } } },
    });

    if (!quotation) {
      return { success: false, message: "Quotation not found" };
    }

    if (quotation.convertedToId || quotation.status !== "open") {
      return { success: false, message: "This quotation has already been converted" };
    }

    const paidAmount = toNumber(formData.get("paidAmount"));
    const dueDateRaw = String(formData.get("dueDate") || "");
    const notes = String(formData.get("notes") || "").trim() || quotation.notes;
    const gstRateId = String(formData.get("gstRateId") || "").trim() || null;
    // Re-resolved against the store's own current GstRate row rather than
    // trusted from the client — see resolveGstRateSnapshot's own doc
    // comment.
    const gstRateSnapshot = await resolveGstRateSnapshot(storeId, gstRateId);

    const businessSettings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { gstScheme: true, state: true },
    });

    // Recomputed per line via the same computeGst() every other invoice
    // creation path uses (createInvoice/updateInvoiceLineItem), rather than
    // trusting a single flat `taxAmount` the client computed with no SGST/
    // CGST/IGST split — this form re-asks for a fresh tax amount rather
    // than reusing the quotation's own (see this function's doc comment),
    // and the previous flat number left InvoiceItem.sgstAmount/cgstAmount/
    // igstAmount at 0 on every converted invoice, so the printed tax table
    // showed ₹0 despite a nonzero Total. computeGst() itself zeroes the
    // breakdown unconditionally for a Composition-scheme store, which is
    // what the standalone check below already enforced — kept as an
    // explicit rejection (rather than silently zeroing) so the store owner
    // sees why, same as createQuotation's own guard.
    const gstRatePercent = gstRateSnapshot?.gstRatePercent ? Number(gstRateSnapshot.gstRatePercent) : 0;
    const gstScheme = businessSettings?.gstScheme ?? "REGULAR_B2C";
    const storeState = businessSettings?.state ?? null;
    const customerState = quotation.customer?.state ?? null;

    if (gstScheme === "COMPOSITION" && gstRatePercent !== 0) {
      return {
        success: false,
        message: "This store is on the Composition Scheme and cannot charge GST on an invoice.",
      };
    }

    const itemTaxableValue = (item: (typeof quotation.items)[number]) =>
      Number(item.rate ?? 0) * Number((item.purity === "DIAMOND" ? item.caratWeight : item.netWeight) ?? 0) +
      Number(item.makingCharge) +
      Number(item.hmCharge) +
      Number(item.stoneCharge);

    const itemGst = quotation.items.map((item) =>
      computeGst(itemTaxableValue(item), gstRatePercent, gstScheme, storeState, customerState),
    );
    const taxAmount = itemGst.reduce((sum, g) => sum + g.sgst + g.cgst + g.igst, 0);

    const subtotal = Number(quotation.subtotal);
    const makingCharges = Number(quotation.makingCharges);
    const stoneCharges = Number(quotation.stoneCharges);
    const discount = Number(quotation.discount);

    const rawTotal = subtotal + makingCharges + stoneCharges - discount + taxAmount;
    // Standard Indian-billing "Round Off" — see computeRoundOff's own doc
    // comment. This is a fresh Invoice being created from the quotation
    // (its own tax input, per this function's doc comment), so it gets its
    // own round-off computed against its own total, independent of whatever
    // roundOffAmount the source Quotation was saved with.
    const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal);
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    let status: InvoiceStatus = InvoiceStatus.PAID;
    if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
    else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;

    const invoiceNumber = await generateInvoiceNumber(storeId);

    // Default interactive-transaction timeout is 5s — the per-item stock
    // lookup+decrement loop below can exceed that on a multi-line quotation
    // over a real (non-local) DB connection and throw P2028 ("Transaction
    // not found"). Same fix as createInvoice/createPurchase's transactions.
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          storeId,
          invoiceNumber,
          customerId: quotation.customerId,
          invoiceDate: new Date(),
          dueDate: dueDateRaw ? new Date(dueDateRaw) : undefined,
          status,
          subtotal,
          makingCharges,
          stoneCharges,
          discount,
          taxAmount,
          roundOffAmount,
          totalAmount,
          paidAmount,
          balanceAmount,
          notes,
          locationId: quotation.locationId ?? undefined,
          gstRateId: gstRateSnapshot?.gstRateId ?? undefined,
          gstRateName: gstRateSnapshot?.gstRateName ?? undefined,
          gstRatePercent: gstRateSnapshot?.gstRatePercent ?? undefined,
          // Recorded the same way a direct invoice does, so a quotation-born
          // sale attributes to whoever converted it instead of falling into
          // the Sales-by-User report's "Not recorded" bucket.
          createdById: actor.id ?? null,
          createdByName: actor.name ?? actor.email ?? null,
          items: {
            create: quotation.items.map((item, index) => ({
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
              purityLabel: item.purityLabel ?? undefined,
              quantity: item.quantity,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
              stoneWeight: item.stoneWeight ?? undefined,
              caratWeight: item.caratWeight ?? undefined,
              rate: item.rate ?? undefined,
              makingCharge: item.makingCharge,
              makingChargeType: item.makingChargeType,
              stoneCharge: item.stoneCharge,
              stoneRate: item.stoneRate ?? undefined,
              stoneMetalTypeName: item.stoneMetalTypeName ?? undefined,
              stoneTypeNames: item.stoneTypeNames ?? undefined,
              hmCharge: item.hmCharge,
              lineTotal: item.lineTotal,
              inventoryStockId: item.inventoryStockId ?? undefined,
              sgstAmount: itemGst[index].sgst,
              cgstAmount: itemGst[index].cgst,
              igstAmount: itemGst[index].igst,
              gstRateId: gstRateSnapshot?.gstRateId ?? undefined,
              gstRateName: gstRateSnapshot?.gstRateName ?? undefined,
              gstRatePercent: gstRateSnapshot?.gstRatePercent ?? undefined,
            })),
          },
        },
      });

      for (const item of quotation.items) {
        if (!item.inventoryStockId) continue;

        // Decrement rather than flipping the whole row to SOLD: a row of
        // 100 pieces that sells 2 still has 98 on hand.
        //
        // Clamped at zero instead of refusing: a quotation reserves nothing,
        // so between quoting and converting the stock may legitimately have
        // been sold elsewhere. Going negative would be worse than clamping,
        // and blocking the conversion outright would strand the quotation.
        const soldQty = Math.max(1, item.quantity || 1);
        const currentStock = await tx.inventoryStock.findFirst({
          where: { id: item.inventoryStockId, storeId },
          select: { quantity: true },
        });
        if (!currentStock) continue;

        const takeQty = Math.min(soldQty, currentStock.quantity);
        const remaining = currentStock.quantity - takeQty;

        const { count } = await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId },
          data: {
            ...(takeQty > 0 ? { quantity: { decrement: takeQty } } : {}),
            ...(remaining <= 0 ? { status: InventoryStockStatus.SOLD } : {}),
            saleAmount: item.lineTotal,
          },
        });
        if (count === 0) continue;

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE,
            quantity: takeQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: created.id,
          },
        });
      }

      // DEBIT is the full totalAmount, not balanceAmount — same fix as
      // createInvoice/createKachaInvoice/createPurchase. Unlike those,
      // this conversion had a second, separate gap: paidAmount (a bare
      // number, no payment-method structure — this form never collects
      // one) got stored on the Invoice row but no corresponding ledger
      // CREDIT was ever posted for it, so a quotation converted with money
      // already paid silently dropped that payment from the customer's
      // ledger entirely (worse than double-counting: not recorded at all).
      if (totalAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.SALE,
            customerId: quotation.customerId,
            invoiceId: created.id,
            amount: totalAmount,
            description: `Invoice ${invoiceNumber} balance due (from Quotation ${quotation.quotationNumber})`,
            locationId: quotation.locationId ?? undefined,
          },
        });
      }

      if (paidAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.PAYMENT_IN,
            customerId: quotation.customerId,
            invoiceId: created.id,
            amount: paidAmount,
            description: `Payment received for ${invoiceNumber} (from Quotation ${quotation.quotationNumber})`,
            locationId: quotation.locationId ?? undefined,
          },
        });
      }

      await tx.quotation.update({
        where: { id: quotationId },
        data: { status: "converted", convertedToId: created.id },
      });

      return created;
    }, { timeout: 15000 });

    revalidatePath("/quotations");
    revalidatePath(`/quotations/${quotationId}`);
    revalidatePath("/billing");
    revalidatePath(`/billing/${invoice.id}`);

    return {
      success: true,
      message: `Converted to Invoice ${invoiceNumber}`,
      invoiceId: invoice.id,
    };
  } catch (error) {
    logger.error("convertQuotationToInvoice error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to convert quotation to invoice") };
  }
}
