// lib/actions/purchase-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  InvoiceStatus,
  InventoryStockStatus,
  InventoryFinish,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
  PaymentMethod,
  PurityType,
  ChargeType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { requireStoreScope } from "@/lib/store-context";
import { isVendorGstApplicable, partyGstTypeLabel } from "@/lib/gst";
import { computeRoundOff } from "@/lib/round-off";
import { resolveGstRateSnapshot, type GstRateSnapshot } from "@/lib/actions/gst-rate-actions";
import {
  getLocationScope,
  locationWhere,
  isLocationAllowed,
  resolveWritableLocationId,
  type LocationScope,
} from "@/lib/location-scope";
import { buildExcelExport } from "@/lib/excel-export";
import { formatShortDate } from "@/lib/utils";
import type {
  DataTableExportParams,
  DataTableExportResult,
} from "@/components/shared/data-table-toolbar";

const PURCHASE_SORT_FIELDS = ["purchaseDate", "purchaseNumber", "totalAmount"] as const;

function toPurchaseSortBy(value: string | undefined): PurchaseSortBy {
  return (PURCHASE_SORT_FIELDS as readonly string[]).includes(value ?? "")
    ? (value as PurchaseSortBy)
    : "purchaseDate";
}

export type PurchaseLineItemInput = {
  productId: string;
  itemName: string;
  metalTypeId?: string | null;
  purity?: PurityType | null;
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
  dmoWeight?: number | null;
  hsnCode?: string | null;
  sgstAmount?: number;
  cgstAmount?: number;
  // Charged instead of sgst+cgst on an inter-state purchase — see
  // computePurchaseGst() in lib/gst.ts. Optional purely so an older-shaped
  // payload doesn't fail to parse; treated as 0 when absent.
  igstAmount?: number;
  // Which configured GstRate THIS line uses — see PurchaseItem.gstRateId's
  // own doc comment in schema.prisma. Optional for the same reason as
  // InvoiceLineItemInput.gstRateId.
  gstRateId?: string | null;
};

/** Never trust client input for the making-charge mode — anything other
 * than a valid ChargeType falls back to FIXED. */
function toChargeType(value: unknown): ChargeType {
  return value === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
}

export type PurchaseFormState = {
  success: boolean;
  message: string;
  purchaseId?: string;
  errors?: Record<string, string[]>;
};

const initialState: PurchaseFormState = { success: false, message: "" };

export type PaymentEntryInput = {
  method: string;
  amount: number;
  reference?: string | null;
  bankName?: string | null;
  attachmentUrl?: string | null;
};

function parsePayments(raw: string): PaymentEntryInput[] | null {
  let payments: PaymentEntryInput[];
  try {
    payments = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(payments) || payments.length < 1 || payments.length > 2) {
    return null;
  }

  for (const payment of payments) {
    if (!Object.values(PaymentMethod).includes(payment.method as PaymentMethod)) {
      return null;
    }
    if (!(Number(payment.amount) > 0)) {
      return null;
    }
  }

  return payments;
}

/**
 * Same shape/validation as parsePayments, but allows zero rows — used at
 * document-CREATION time (createPurchase) where a fully-on-credit purchase
 * (nothing paid yet) is a normal, valid case. parsePayments itself stays
 * strict (1-2 rows required) because recordPurchasePayment's dialog only
 * ever appears once there's a known positive balance to collect against.
 */
function parseOptionalPayments(raw: string): PaymentEntryInput[] | null {
  let payments: PaymentEntryInput[];
  try {
    payments = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(payments) || payments.length > 2) {
    return null;
  }

  for (const payment of payments) {
    if (!Object.values(PaymentMethod).includes(payment.method as PaymentMethod)) {
      return null;
    }
    if (!(Number(payment.amount) > 0)) {
      return null;
    }
  }

  return payments;
}

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function toDecimal(value: number | null | undefined): Prisma.Decimal | undefined {
  if (value === null || value === undefined) return undefined;
  return new Prisma.Decimal(value);
}

/**
 * Diamond items price per carat, not per gram — every other purity still
 * prices off netWeight. Duplicated per action file (same convention as the
 * generateXNumber helpers in this codebase) rather than a shared import.
 */
function lineQuantity(item: { purity?: PurityType | null; netWeight?: number | null; caratWeight?: number | null }) {
  return item.purity === PurityType.DIAMOND ? toNumber(item.caratWeight) : toNumber(item.netWeight);
}

// Pre-tax — this is also what feeds InventoryStock.purchaseAmount (the
// stock's own cost basis), which GST paid to the vendor never becomes part
// of, unlike an as-billed total. See lineTotalWithTax below for the other
// one, used only for PurchaseItem.lineTotal.
function lineTotal(item: PurchaseLineItemInput) {
  const metalValue = toNumber(item.rate) * lineQuantity(item);
  return metalValue + toNumber(item.makingCharge) + toNumber(item.stoneCharge);
}

// Same base as lineTotal, plus this line's own GST — mirrors
// InvoiceItem.lineTotal's convention (the as-billed total), used only for
// PurchaseItem.lineTotal, never for stock cost basis.
function lineTotalWithTax(item: PurchaseLineItemInput) {
  return (
    lineTotal(item) +
    toNumber(item.sgstAmount) +
    toNumber(item.cgstAmount) +
    toNumber(item.igstAmount)
  );
}

/**
 * Resolves each line's own gstRateId into a verified snapshot — GST is
 * picked per line now, not once for the whole purchase (see
 * PurchaseItem.gstRateId's doc comment in schema.prisma), but a single
 * purchase commonly has far fewer DISTINCT rates in use than it has lines.
 * Deduping first means at most one resolveGstRateSnapshot DB call per
 * distinct id actually used, not one per line item. Must run to completion
 * BEFORE the prisma.$transaction callback that builds the nested
 * items.create array — that array has to be plain, already-resolved
 * objects, not promises. Mirrors invoice-actions.ts's identical helper.
 */
async function resolvePerLineGstRateSnapshots(
  storeId: string,
  items: PurchaseLineItemInput[],
) {
  const distinctIds = [
    ...new Set(items.map((item) => item.gstRateId).filter((id): id is string => !!id)),
  ];
  const snapshots = await Promise.all(
    distinctIds.map((id) => resolveGstRateSnapshot(storeId, id)),
  );
  const map = new Map<string, GstRateSnapshot>();
  distinctIds.forEach((id, index) => {
    const snapshot = snapshots[index];
    if (snapshot) map.set(id, snapshot);
  });
  return map;
}

/** Unique per store — lets resolveManualEntryProductId find-or-create
 *  without ever racing itself into a duplicate (Product's own
 *  @@unique([storeId, productCode]) backs this up regardless). */
const MANUAL_ENTRY_PRODUCT_CODE = "MANUAL-ENTRY";

/**
 * A Purchase line item can be entered without picking a catalog Product
 * (the form's "Enter Manually (No Product)" choice) — but
 * InventoryStock.productId and PurchaseItem.productId are both required,
 * non-nullable foreign keys, and a large enough set of other places already
 * assume a real Product hangs off every stock row (the Invoice/Quotation
 * "pick a stock item to sell" queries, the item-ledger report, My Jobs) that
 * making the FK nullable everywhere it's read would be a much bigger, more
 * error-prone change than this. Instead, every manually-entered line reuses
 * one lazily-created, inactive (so it never appears in the Product picker
 * itself) placeholder Product per store — created the first time a store
 * actually uses "Enter Manually", found by its fixed productCode on every
 * purchase after that.
 */
async function resolveManualEntryProductId(storeId: string): Promise<string> {
  const existing = await prisma.product.findFirst({
    where: { storeId, productCode: MANUAL_ENTRY_PRODUCT_CODE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.product.create({
    data: {
      storeId,
      productCode: MANUAL_ENTRY_PRODUCT_CODE,
      name: "Manual Entry (no product)",
      isActive: false,
    },
    select: { id: true },
  });
  return created.id;
}

async function generatePurchaseNumber(storeId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.purchase.count({
    where: {
      storeId,
      purchaseNumber: { startsWith: `PUR-${year}-` },
    },
  });

  return `PUR-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Auto-generated stock code for stock rows created by a purchase (the manual
 * stock-entry form has the user type one; here nobody does). `offset` lets a
 * caller mint several sequential codes off a single base count without each
 * call re-reading a count that hasn't been written yet inside the same
 * transaction.
 */
async function generateStockCode(storeId: string, offset = 0) {
  const year = new Date().getFullYear();
  const count = await prisma.inventoryStock.count({
    where: {
      storeId,
      stockCode: { startsWith: `STK-${year}-` },
    },
  });

  return `STK-${year}-${String(count + 1 + offset).padStart(4, "0")}`;
}

function mapPurchase(purchase: any) {
  return {
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    vendorInvoiceNumber: purchase.vendorInvoiceNumber,
    purchaseDate: purchase.purchaseDate.toISOString(),
    status: purchase.status as InvoiceStatus,
    subtotal: Number(purchase.subtotal),
    makingCharges: Number(purchase.makingCharges),
    stoneCharges: Number(purchase.stoneCharges),
    discount: Number(purchase.discount),
    taxAmount: Number(purchase.taxAmount),
    totalAmount: Number(purchase.totalAmount),
    roundOffAmount: Number(purchase.roundOffAmount ?? 0),
    paidAmount: Number(purchase.paidAmount),
    balanceAmount: Number(purchase.balanceAmount),
    notes: purchase.notes,
    locationId: purchase.locationId ?? null,
    vendor: purchase.vendor
      ? {
          id: purchase.vendor.id,
          name: purchase.vendor.name,
          phone: purchase.vendor.phone,
        }
      : null,
    items: (purchase.items ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      itemName: item.itemName,
      metalTypeId: item.metalTypeId,
      purity: item.purity,
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
      dmoWeight: item.dmoWeight ? Number(item.dmoWeight) : null,
      hsnCode: item.hsnCode ?? null,
      sgstAmount: Number(item.sgstAmount ?? 0),
      cgstAmount: Number(item.cgstAmount ?? 0),
      igstAmount: Number(item.igstAmount ?? 0),
      gstRateId: item.gstRateId ?? null,
      gstRateName: item.gstRateName ?? null,
      gstRatePercent: item.gstRatePercent != null ? Number(item.gstRatePercent) : null,
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
    })),
  };
}

export type Purchase = ReturnType<typeof mapPurchase>;

export type PurchaseSortBy = "purchaseDate" | "purchaseNumber" | "totalAmount";

function buildPurchasesWhere(
  storeId: string,
  params: { search?: string; status?: InvoiceStatus | "ALL" },
  scope: LocationScope,
) {
  const search = String(params.search || "").trim();
  const status = params.status && params.status !== "ALL" ? params.status : undefined;

  return {
    storeId,
    ...locationWhere(scope),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { purchaseNumber: { contains: search, mode: "insensitive" as const } },
            { vendor: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

function buildPurchasesOrderBy(
  sortBy: PurchaseSortBy,
  sortOrder: "asc" | "desc",
): Prisma.PurchaseOrderByWithRelationInput {
  return { [sortBy]: sortOrder } as Prisma.PurchaseOrderByWithRelationInput;
}

export type GetPurchasesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: InvoiceStatus | "ALL";
  sortBy?: PurchaseSortBy;
  sortOrder?: "asc" | "desc";
};

export async function getPurchases(params: GetPurchasesParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const sortBy = params.sortBy || "purchaseDate";
  const sortOrder = params.sortOrder || "desc";

  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const where = buildPurchasesWhere(storeId, params, scope);

  const [totalCount, purchases] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      orderBy: buildPurchasesOrderBy(sortBy, sortOrder),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        vendor: { select: { id: true, name: true, phone: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    purchases: purchases.map(mapPurchase),
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

function toPurchaseStatus(value: string | undefined): InvoiceStatus | "ALL" {
  if (value && (Object.values(InvoiceStatus) as string[]).includes(value)) {
    return value as InvoiceStatus;
  }
  return "ALL";
}

/** Exports either an explicit set of purchases (selectedIds) or the current
 * search/status/sort-filtered list (mirrors getPurchases' own filtering so
 * "export filtered results" matches exactly what's on screen). */
export async function exportPurchasesToExcel(
  params: DataTableExportParams = {},
): Promise<DataTableExportResult> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.PURCHASE_VIEW);
    } catch {
      return { success: false, message: "You do not have permission to export purchases." };
    }

    const storeId = await requireStoreScope();
    const scope = await getLocationScope();
    const sortBy = toPurchaseSortBy(params.sortBy);
    const sortOrder = params.sortOrder || "desc";
    const status = toPurchaseStatus(params.status);

    const where =
      params.selectedIds && params.selectedIds.length > 0
        ? { id: { in: params.selectedIds }, storeId, ...locationWhere(scope) }
        : buildPurchasesWhere(storeId, { search: params.search, status }, scope);

    const purchases = await prisma.purchase.findMany({
      where,
      orderBy: buildPurchasesOrderBy(sortBy, sortOrder),
      include: {
        vendor: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!purchases.length) {
      return { success: false, message: "No purchases found to export." };
    }

    const rows = purchases.map(mapPurchase).map((purchase, index) => ({
      "Sr. No.": index + 1,
      "Purchase Number": purchase.purchaseNumber,
      Date: formatShortDate(purchase.purchaseDate),
      Vendor: purchase.vendor?.name || "",
      Status: purchase.status,
      Subtotal: purchase.subtotal,
      "Making Charges": purchase.makingCharges,
      "Stone Charges": purchase.stoneCharges,
      Discount: purchase.discount,
      "Tax Amount": purchase.taxAmount,
      "Total Amount": purchase.totalAmount,
      "Paid Amount": purchase.paidAmount,
      "Balance Amount": purchase.balanceAmount,
    }));

    const { fileName, fileBase64 } = buildExcelExport(rows, "Purchases", "purchases");

    return {
      success: true,
      message: "Purchases exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    console.error("exportPurchasesToExcel error:", error);
    return { success: false, message: "Failed to export purchases." };
  }
}

export async function getPurchaseById(id: string) {
  const storeId = await requireStoreScope();

  const purchase = await prisma.purchase.findFirst({
    where: { id, storeId },
    include: {
      vendor: { select: { id: true, name: true, phone: true } },
      items: true,
      ledgerEntries: { orderBy: { entryDate: "desc" } },
    },
  });

  if (!purchase) return null;
  return mapPurchase(purchase);
}

/** Lightweight vendor list for the purchase form's vendor picker. */
export async function getPurchaseFormVendors() {
  const storeId = await requireStoreScope();

  const vendors = await prisma.vendor.findMany({
    where: { storeId, isActive: true, isArchived: false },
    orderBy: { name: "asc" },
    // `state` rides along so the form can tell an inter-state purchase from
    // an intra-state one (computePurchaseGst's isInterState) without a
    // second round trip. `gstType` rides along too — a purchase's GST is
    // computed from the VENDOR's own registration, not the store's, see
    // computePurchaseGst() in lib/gst.ts.
    select: { id: true, name: true, phone: true, vendorCode: true, state: true, gstType: true },
  });

  return vendors;
}

/** Product picker for purchase line items — every line creates brand new stock. */
export async function getPurchaseFormProducts() {
  const storeId = await requireStoreScope();

  const products = await prisma.product.findMany({
    where: { storeId, isActive: true },
    orderBy: [{ name: "asc" }, { productCode: "asc" }],
    select: {
      id: true,
      productCode: true,
      name: true,
      category: { select: { name: true } },
      categoryType: { select: { name: true } },
      metalType: { select: { id: true, name: true } },
      defaultPurity: true,
      defaultMakingCharge: true,
      defaultMakingChargeType: true,
      defaultStoneCharge: true,
      hasStoneComponent: true,
      defaultStoneRate: true,
      defaultCaratWeight: true,
      defaultStoneMetalTypeName: true,
      defaultStoneTypeNames: true,
      hsnCode: true,
      isActive: true,
    },
  });

  return products.map((product) => ({
    ...product,
    category: product.category?.name ?? null,
    ornamentType: product.categoryType?.name ?? null,
    metalType: product.metalType ?? null,
    defaultMakingCharge:
      product.defaultMakingCharge !== null ? Number(product.defaultMakingCharge) : null,
    defaultStoneCharge:
      product.defaultStoneCharge !== null ? Number(product.defaultStoneCharge) : null,
    defaultStoneRate:
      product.defaultStoneRate !== null ? Number(product.defaultStoneRate) : null,
    defaultCaratWeight:
      product.defaultCaratWeight !== null ? Number(product.defaultCaratWeight) : null,
  }));
}

/**
 * Create a purchase with its line items in one transaction. Unlike an
 * invoice (which marks existing stock SOLD), every purchase line creates a
 * brand new InventoryStock row — stock comes IN, it doesn't go out. If the
 * purchase isn't fully paid up front, a CREDIT ledger entry is recorded
 * against the vendor for the outstanding amount (the shop owes the vendor —
 * opposite direction from a sale's customer-owes-shop DEBIT). Whatever IS
 * paid up front (via paymentsJson's 1-2 method rows) gets its own DEBIT
 * ledger entry per row, same shape recordPurchasePayment writes.
 */
export async function createPurchase(
  prevState: PurchaseFormState = initialState,
  formData: FormData,
): Promise<PurchaseFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    let actor;
    try {
      actor = await requirePermission(PERMISSIONS.PURCHASE_CREATE);
    } catch {
      return { success: false, message: "You do not have permission to create purchases." };
    }

    const vendorId = String(formData.get("vendorId") || "");
    const locationId = String(formData.get("locationId") || "").trim() || null;
    const itemsRaw = String(formData.get("itemsJson") || "[]");

    if (!vendorId) {
      return { success: false, message: "Please select a vendor" };
    }

    let items: PurchaseLineItemInput[] = [];
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return { success: false, message: "Invalid line items" };
    }

    if (!items.length) {
      return { success: false, message: "Add at least one line item" };
    }

    // Don't trust client-submitted charge type — coerce anything unexpected
    // (missing, malformed, or a value outside the enum) down to FIXED.
    items = items.map((item) => ({
      ...item,
      makingChargeType: toChargeType(item.makingChargeType),
    }));

    const discount = toNumber(formData.get("discount"));
    // Recomputed from each line's own sgst/cgst/igst rather than trusted
    // from a single form field — GST is picked per line now (see
    // PurchaseItem.gstRateId's doc comment in schema.prisma), so the
    // per-line breakdown is the source of truth the saved total must match.
    // sgst+cgst (intra-state) and igst (inter-state) are never both nonzero
    // on the same line — see computePurchaseGst() in lib/gst.ts — so
    // summing all three here is safe either way.
    const sgstAmount = items.reduce((sum, item) => sum + toNumber(item.sgstAmount), 0);
    const cgstAmount = items.reduce((sum, item) => sum + toNumber(item.cgstAmount), 0);
    const igstAmount = items.reduce((sum, item) => sum + toNumber(item.igstAmount), 0);
    const taxAmount = sgstAmount + cgstAmount + igstAmount;
    // Legacy document-level snapshot only — see Purchase.gstRateId's own
    // doc comment. Never a real user-facing selection anymore; each line
    // now resolves its own snapshot via resolvePerLineGstRateSnapshots
    // below.
    const gstRateId = String(formData.get("gstRateId") || "").trim() || null;

    // paymentsJson (1-2 method rows, or none for a fully-on-credit purchase)
    // is what purchase-form.tsx's "Paid Now" section sends. See
    // createInvoice's identical fallback for why a missing paymentsJson
    // field (no current caller does this for createPurchase, but kept for
    // the same robustness) still works off the legacy plain `paidAmount`.
    const paymentsRaw = formData.get("paymentsJson");
    const payments = paymentsRaw !== null ? parseOptionalPayments(String(paymentsRaw)) : [];
    if (payments === null) {
      return {
        success: false,
        message: "Add 1-2 valid payment methods with an amount, or leave Paid Now blank for a fully-on-credit purchase.",
      };
    }
    const paidAmount =
      paymentsRaw !== null
        ? payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
        : toNumber(formData.get("paidAmount"));
    const purchaseDateRaw = String(formData.get("purchaseDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;
    const vendorInvoiceNumber = String(formData.get("vendorInvoiceNumber") || "").trim() || null;

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.rate) * lineQuantity(item),
      0,
    );
    const makingCharges = items.reduce((sum, item) => sum + toNumber(item.makingCharge), 0);
    const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
    const rawTotal = subtotal + makingCharges + stoneCharges - discount + taxAmount;
    // Indian billing convention: the saved total is rounded to the nearest
    // whole rupee, with the (small, signed) adjustment kept alongside it as
    // its own line — see lib/round-off.ts. Applied once here, document-level,
    // same as Discount, regardless of Purchase's per-line GST.
    const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal);
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    let status: InvoiceStatus = InvoiceStatus.PAID;
    if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
    else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;

    const storeId = await requireStoreScope();

    // Re-resolved against the store's own current GstRate row rather than
    // trusted from the client — see resolveGstRateSnapshot's own doc
    // comment. A missing/invalid id (e.g. an unregistered vendor, whose GST
    // Rate picker is disabled and never selects one) just leaves the
    // snapshot null instead of failing the save.
    const gstRateSnapshot = await resolveGstRateSnapshot(storeId, gstRateId);

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, storeId },
      select: { id: true, name: true, gstType: true },
    });
    if (!vendor) {
      return { success: false, message: "Please select a vendor" };
    }

    // A purchase's GST is whatever the VENDOR's own invoice can legally
    // show, not whatever our own store's gstScheme is — see
    // isVendorGstApplicable()'s doc comment in lib/gst.ts. Our own store
    // being on Composition Scheme never suppresses this; it only affects
    // whether we can claim it back as input credit, a separate concern from
    // whether the purchase itself carries GST. Enforced again here because
    // a server action is reachable independent of whatever the form's own
    // UI disabled.
    if (
      !isVendorGstApplicable(vendor.gstType) &&
      (sgstAmount !== 0 || cgstAmount !== 0 || igstAmount !== 0 || taxAmount !== 0)
    ) {
      return {
        success: false,
        message: `This vendor is ${partyGstTypeLabel(vendor.gstType).toLowerCase()} and cannot charge GST on a purchase.`,
      };
    }

    // A line with no product picked (the form's own "Enter Manually (No
    // Product)" choice) still needs a real Product row under the hood —
    // InventoryStock/PurchaseItem.productId is a hard, non-nullable FK, and
    // making it nullable would ripple into every other place that reads
    // stock.product.name/hsnCode (the Invoice/Quotation stock pickers, the
    // item-ledger report, My Jobs...) — see resolveManualEntryProductId's
    // own doc comment for the fuller reasoning. Resolved to one
    // lazily-created placeholder per store instead.
    if (items.some((item) => !item.productId)) {
      const manualEntryProductId = await resolveManualEntryProductId(storeId);
      items = items.map((item) =>
        item.productId ? item : { ...item, productId: manualEntryProductId },
      );
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      return { success: false, message: "One or more selected products are invalid" };
    }

    // See resolveWritableLocationId's own doc comment — without this, a
    // location-restricted Staff user submitting no location at all saved
    // the purchase with locationId: null, which then never matches their
    // own location-scoped list afterward.
    const locationScope = await getLocationScope();
    const locationResolution = await resolveWritableLocationId(storeId, locationId, locationScope);
    if (!locationResolution.ok) {
      return { success: false, message: locationResolution.message };
    }
    const resolvedLocationId = locationResolution.locationId;

    const purchaseNumber = await generatePurchaseNumber(storeId);
    const purchaseDate = purchaseDateRaw ? new Date(purchaseDateRaw) : new Date();

    // Mint all stock codes off one base count before any writes happen, so
    // each sequential offset lands on a distinct number.
    const stockCodes: string[] = [];
    for (let i = 0; i < items.length; i++) {
      stockCodes.push(await generateStockCode(storeId, i));
    }

    // Resolved once, up front, for every DISTINCT rate any line actually
    // uses — see resolvePerLineGstRateSnapshots' own doc comment. Must
    // happen before the transaction below since a nested Prisma `create`
    // array has to be plain objects, not promises.
    const perLineGstRateSnapshots = await resolvePerLineGstRateSnapshots(storeId, items);

    // Default interactive-transaction timeout is 5s — this transaction does
    // a sequential per-item InventoryStock create, per-item InventoryTransaction
    // create, plus the Purchase/PurchaseItem/ledger writes, all in one round
    // trip each; a multi-line purchase over a real (non-local) DB connection
    // reliably exceeds 5s and throws P2028 ("Transaction not found") once
    // Prisma has already closed it out from under the callback. Same fix as
    // store-registration-actions.ts's own transaction for the same reason.
    const purchase = await prisma.$transaction(async (tx) => {
      // 1. Create a new InventoryStock row per line item first, so the
      //    Purchase's nested item creates can link straight to it.
      const stockIds: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const stock = await tx.inventoryStock.create({
          data: {
            storeId,
            productId: item.productId,
            stockCode: stockCodes[i],
            metalTypeId: item.metalTypeId ?? undefined,
            purity: item.purity ?? undefined,
            quantity: item.quantity || 1,
            status: InventoryStockStatus.IN_STOCK,
            finish: InventoryFinish.PAKKA,
            grossWeight: toDecimal(item.grossWeight),
            netWeight: toDecimal(item.netWeight),
            dmoWeight: toDecimal(item.dmoWeight),
            stoneWeight: toDecimal(item.stoneWeight),
            // Previously dropped here even though it's saved onto the
            // sibling PurchaseItem below — a purchased composite/Diamond
            // item's stock row had nowhere to keep its own carat weight.
            caratWeight: toDecimal(item.caratWeight),
            purchaseRate: toDecimal(item.rate),
            purchaseAmount: toDecimal(lineTotal(item)),
            makingCharge: toDecimal(item.makingCharge),
            makingChargeType: toChargeType(item.makingChargeType),
            stoneCharge: toDecimal(item.stoneCharge),
            stoneRate: toDecimal(item.stoneRate),
            stoneMetalTypeName: item.stoneMetalTypeName ?? undefined,
            stoneTypeNames: item.stoneTypeNames ?? undefined,
            vendorId,
            vendorName: vendor.name,
            purchaseDate,
            locationId: resolvedLocationId ?? undefined,
          },
          select: { id: true },
        });
        stockIds.push(stock.id);
      }

      // 2. Create the Purchase + its line items, each already linked to the
      //    stock row created for it above.
      const created = await tx.purchase.create({
        data: {
          storeId,
          purchaseNumber,
          vendorId,
          purchaseDate,
          status,
          subtotal,
          makingCharges,
          stoneCharges,
          discount,
          taxAmount,
          sgstAmount,
          cgstAmount,
          igstAmount,
          totalAmount,
          roundOffAmount,
          paidAmount,
          balanceAmount,
          notes,
          vendorInvoiceNumber,
          gstRateId: gstRateSnapshot?.gstRateId ?? undefined,
          gstRateName: gstRateSnapshot?.gstRateName ?? undefined,
          gstRatePercent: gstRateSnapshot?.gstRatePercent ?? undefined,
          locationId: resolvedLocationId ?? undefined,
          createdById: actor.id ?? undefined,
          createdByName: actor.name ?? actor.email ?? undefined,
          createdByRole: actor.role ?? undefined,
          items: {
            create: items.map((item, i) => ({
              productId: item.productId,
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
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
              dmoWeight: item.dmoWeight ?? undefined,
              hsnCode: item.hsnCode ?? undefined,
              sgstAmount: item.sgstAmount ?? 0,
              cgstAmount: item.cgstAmount ?? 0,
              igstAmount: item.igstAmount ?? 0,
              // This LINE's own resolved snapshot, distinct from the
              // purchase-level gstRateSnapshot above — see
              // PurchaseItem.gstRateId's doc comment. `undefined` (not
              // `null`) to match this function's existing optional-relation
              // convention.
              gstRateId: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateId ?? undefined
                : undefined,
              gstRateName: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateName ?? undefined
                : undefined,
              gstRatePercent: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRatePercent ?? undefined
                : undefined,
              lineTotal: lineTotalWithTax(item),
              inventoryStockId: stockIds[i],
            })),
          },
        },
      });

      // 3. Log an inventory transaction per new stock row now that we have
      //    the purchase id to reference.
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: stockIds[i],
            transactionType: InventoryTransactionType.PURCHASE,
            quantity: item.quantity || 1,
            grossWeight: toDecimal(item.grossWeight),
            netWeight: toDecimal(item.netWeight),
            referenceType: "Purchase",
            referenceId: created.id,
          },
        });
      }

      // 4. Outstanding balance owed to the vendor — CREDIT (opposite
      //    direction from a Sale's customer-owes-shop DEBIT).
      if (balanceAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.PURCHASE,
            vendorId,
            purchaseId: created.id,
            amount: balanceAmount,
            description: `Purchase ${purchaseNumber} balance due`,
            locationId: resolvedLocationId ?? undefined,
          },
        });
      }

      // One DEBIT entry per payment-method row actually paid out at the
      // moment of purchase — same shape recordPurchasePayment writes for a
      // later top-up payment (opposite direction from a Sale's CREDIT: cash
      // paid out reduces what the shop owes the vendor).
      for (const [index, payment] of payments.entries()) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.PAYMENT_OUT,
            vendorId,
            purchaseId: created.id,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
            locationId: resolvedLocationId ?? undefined,
            description: index === 0 ? `Payment made for ${purchaseNumber}` : undefined,
          },
        });
      }

      return created;
    }, { timeout: 15000 });

    revalidatePath("/purchases");
    revalidatePath("/inventory/stock");

    return {
      success: true,
      message: `Purchase ${purchaseNumber} created`,
      purchaseId: purchase.id,
    };
  } catch (error) {
    console.error("createPurchase error:", error);
    return { success: false, message: "Failed to create purchase" };
  }
}

/**
 * Record a payment against a purchase's outstanding balance. Reduces
 * balanceAmount, bumps paidAmount, updates status, and logs a DEBIT ledger
 * entry (cash paid out reduces what the shop owes the vendor).
 */
export async function recordPurchasePayment(
  purchaseId: string,
  prevState: PurchaseFormState = initialState,
  formData: FormData,
): Promise<PurchaseFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.PURCHASE_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to record purchase payments." };
    }

    const paymentsRaw = String(formData.get("paymentsJson") || "[]");
    const notes = String(formData.get("notes") || "").trim() || null;

    const payments = parsePayments(paymentsRaw);
    if (!payments) {
      return { success: false, message: "Add 1-2 valid payment methods with an amount" };
    }

    const amount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    if (amount <= 0) {
      return { success: false, message: "Enter a valid payment amount" };
    }

    const storeId = await requireStoreScope();

    const purchase = await prisma.purchase.findFirst({ where: { id: purchaseId, storeId } });
    if (!purchase) return { success: false, message: "Purchase not found" };

    const newPaid = Number(purchase.paidAmount) + amount;
    const newBalance = Math.max(0, Number(purchase.totalAmount) - newPaid);
    const status: InvoiceStatus =
      newBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

    await prisma.$transaction([
      prisma.purchase.update({
        where: { id: purchaseId },
        data: { paidAmount: newPaid, balanceAmount: newBalance, status },
      }),
      ...payments.map((payment, index) =>
        prisma.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.PAYMENT_OUT,
            vendorId: purchase.vendorId,
            purchaseId,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
            locationId: purchase.locationId ?? undefined,
            description:
              notes ??
              (index === 0 ? `Payment made for ${purchase.purchaseNumber}` : undefined),
          },
        }),
      ),
    ]);

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${purchaseId}`);

    return { success: true, message: "Payment recorded" };
  } catch (error) {
    console.error("recordPurchasePayment error:", error);
    return { success: false, message: "Failed to record payment" };
  }
}

/**
 * Purchase date, vendor invoice number, store location, and notes are
 * editable here — no vendor, line items, or amounts. Once stock is created
 * and ledger entries posted, changing those needs the same
 * restore-old-stock/reapply-new-stock/reconcile-ledger reversal logic
 * updateInvoice's own line-item branch uses, not a quiet in-place edit —
 * mirrors EditInvoiceDialog's identically-scoped metadata-only edit.
 * Available regardless of payment status (any non-deleted purchase), since
 * none of these fields affect stock or money.
 */
export async function updatePurchase(
  id: string,
  prevState: PurchaseFormState = initialState,
  formData: FormData,
): Promise<PurchaseFormState> {
  try {
    try {
      await requirePermission(PERMISSIONS.PURCHASE_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to edit purchases." };
    }

    const storeId = await requireStoreScope();
    const purchase = await prisma.purchase.findFirst({ where: { id, storeId } });
    if (!purchase) return { success: false, message: "Purchase not found" };

    const purchaseDateRaw = String(formData.get("purchaseDate") || "");
    const vendorInvoiceNumber = String(formData.get("vendorInvoiceNumber") || "").trim() || null;
    const notes = String(formData.get("notes") || "").trim() || null;
    const locationId = String(formData.get("locationId") || "").trim() || null;

    const locationScope = await getLocationScope();
    const locationResolution = await resolveWritableLocationId(storeId, locationId, locationScope);
    if (!locationResolution.ok) {
      return { success: false, message: locationResolution.message };
    }
    const resolvedLocationId = locationResolution.locationId;

    await prisma.purchase.update({
      where: { id },
      data: {
        purchaseDate: purchaseDateRaw ? new Date(purchaseDateRaw) : purchase.purchaseDate,
        vendorInvoiceNumber,
        notes,
        locationId: resolvedLocationId ?? null,
      },
    });

    revalidatePath("/purchases");
    revalidatePath(`/purchases/${id}`);

    return { success: true, message: "Purchase updated" };
  } catch (error) {
    console.error("updatePurchase error:", error);
    return { success: false, message: "Failed to update purchase" };
  }
}

/**
 * Only DRAFT purchases with no payments/ledger history and stock that
 * hasn't moved since creation can be deleted — mirrors deleteInvoice's
 * guard, extended to also require the stock it created is still untouched.
 */
export async function deletePurchase(id: string): Promise<PurchaseFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.PURCHASE_DELETE);
    } catch {
      return { success: false, message: "You do not have permission to delete purchases." };
    }

    const storeId = await requireStoreScope();

    const purchase = await prisma.purchase.findFirst({
      where: { id, storeId },
      include: {
        ledgerEntries: { select: { id: true }, take: 1 },
        items: {
          include: { inventoryStock: { select: { id: true, status: true } } },
        },
      },
    });

    if (!purchase) return { success: false, message: "Purchase not found" };

    const stockIds = purchase.items
      .map((item) => item.inventoryStockId)
      .filter((value): value is string => Boolean(value));

    // status alone isn't enough — it only flips to SOLD once quantity hits
    // zero, so a PARTIAL sale (say 3 of 10 pieces) leaves it sitting at
    // IN_STOCK with quantity 7, and the old status-only check let a delete
    // through anyway, which then hard-deleted a stock row a real, live
    // InvoiceItem.inventoryStockId still pointed at. Checking for any
    // transaction on this stock other than the PURCHASE one that created it
    // catches every way stock can move (a sale, a return-restock, a future
    // adjustment/transfer type) — not just "fully sold."
    const movedStockCount = stockIds.length
      ? await prisma.inventoryTransaction.count({
          where: {
            inventoryStockId: { in: stockIds },
            transactionType: { not: InventoryTransactionType.PURCHASE },
          },
        })
      : 0;

    const stockUntouched =
      movedStockCount === 0 &&
      purchase.items.every(
        (item) =>
          !item.inventoryStock || item.inventoryStock.status === InventoryStockStatus.IN_STOCK,
      );

    if (
      purchase.status !== InvoiceStatus.DRAFT ||
      Number(purchase.balanceAmount) !== Number(purchase.totalAmount) ||
      purchase.ledgerEntries.length > 0 ||
      !stockUntouched
    ) {
      return {
        success: false,
        message:
          "Only draft purchases with no payments and unmoved stock can be deleted",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchase.delete({ where: { id } });
      if (stockIds.length) {
        await tx.inventoryStock.deleteMany({ where: { id: { in: stockIds }, storeId } });
      }
    });

    revalidatePath("/purchases");
    revalidatePath("/inventory/stock");

    return { success: true, message: "Purchase deleted" };
  } catch (error) {
    console.error("deletePurchase error:", error);
    return { success: false, message: "Failed to delete purchase" };
  }
}
