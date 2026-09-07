// lib/actions/invoice-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import {
  InvoiceStatus,
  InventoryStockStatus,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
  PaymentMethod,
  PurityType,
  ChargeType,
  TransportMode,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePermission, requirePermissionInStore } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { requireStoreScope, resolveActingStoreId } from "@/lib/store-context";
import {
  getLocationScope,
  locationWhere,
  isLocationAllowed,
  resolveWritableLocationId,
  type LocationScope,
} from "@/lib/location-scope";
import { sendMail } from "@/lib/mailer";
import { invoiceEmail } from "@/lib/email-templates";
import { getBusinessSettings } from "@/lib/actions/settings-actions";
import { resolveGstRateSnapshot, type GstRateSnapshot } from "@/lib/actions/gst-rate-actions";
import { getReturnEligibility } from "@/lib/return-window";
import { amountInWords } from "@/lib/number-to-words";
import { resolveStoreName } from "@/lib/invite-email";
import { buildExcelExport } from "@/lib/excel-export";
import { OversellError } from "@/lib/inventory/oversell-error";
import { formatShortDate } from "@/lib/utils";

export type InvoiceLineItemInput = {
  itemName: string;
  metalTypeId?: string | null;
  purity?: PurityType | null;
  quantity: number;
  grossWeight?: number | null;
  netWeight?: number | null;
  caratWeight?: number | null;
  rate?: number | null;
  makingCharge: number;
  makingChargeType?: ChargeType | string | null;
  stoneCharge: number;
  stoneRate?: number | null;
  stoneMetalTypeName?: string | null;
  stoneTypeNames?: string | null;
  dmoWeight?: number | null;
  stoneWeight?: number | null;
  hmCharge?: number;
  schemeDiscount?: number;
  sgstAmount?: number;
  cgstAmount?: number;
  // Charged instead of sgst+cgst on an inter-state sale — see computeGst()
  // in lib/gst.ts, the single source of truth for this split. Optional
  // (not required) purely so older-shaped payloads don't fail to parse;
  // treated as 0 when absent.
  igstAmount?: number;
  hsnCode?: string | null;
  inventoryStockId?: string | null;
  // Which configured GstRate THIS line uses — see InvoiceItem.gstRateId's
  // own doc comment in schema.prisma. Optional so an older-shaped payload
  // (or a caller like quick-sale-actions.ts that never sets a per-line
  // rate) still parses; resolved into a snapshot the same way Invoice's own
  // (legacy) gstRateId is, just per-distinct-id rather than once per
  // document — see resolvePerLineGstRateSnapshots below.
  gstRateId?: string | null;
};

export type InvoiceFormState = {
  success: boolean;
  message: string;
  invoiceId?: string;
};

const initialState: InvoiceFormState = { success: false, message: "" };

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
 * document-CREATION time (createInvoice) where a fully-on-credit invoice
 * (nothing paid yet) is a normal, valid case. parsePayments itself stays
 * strict (1-2 rows required) because recordInvoicePayment's dialog only
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

/** Never trust client input for the making-charge mode — anything other
 * than a valid ChargeType falls back to FIXED. */
function toChargeType(value: unknown): ChargeType {
  return value === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
}

/**
 * Resolves each line's own gstRateId into a verified snapshot — GST is
 * picked per line now, not once for the whole document (see
 * InvoiceItem.gstRateId's doc comment in schema.prisma), but a single
 * invoice commonly has far fewer DISTINCT rates in use than it has lines
 * (e.g. two lines both on the store's one 3% metal rate). Deduping first
 * means at most one `resolveGstRateSnapshot` DB call per distinct id
 * actually used, not one per line item. Must run to completion BEFORE the
 * `prisma.$transaction` callback that builds the nested `items.create`
 * array — that array has to be plain, already-resolved objects, not
 * promises, so this can't be inlined inside the `items.map(...)` below it.
 */
async function resolvePerLineGstRateSnapshots(
  storeId: string,
  items: InvoiceLineItemInput[],
): Promise<Map<string, GstRateSnapshot>> {
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

/**
 * Diamond items price per carat, not per gram — every other purity still
 * prices off netWeight. Duplicated per action file (same convention as the
 * generateXNumber helpers in this codebase) rather than a shared import.
 */
function lineQuantity(item: { purity?: PurityType | null; netWeight?: number | null; caratWeight?: number | null }) {
  return item.purity === PurityType.DIAMOND ? toNumber(item.caratWeight) : toNumber(item.netWeight);
}

function lineTotal(item: InvoiceLineItemInput) {
  const metalValue = toNumber(item.rate) * lineQuantity(item);
  return (
    metalValue +
    toNumber(item.makingCharge) +
    toNumber(item.hmCharge) +
    toNumber(item.stoneCharge) -
    toNumber(item.schemeDiscount) +
    toNumber(item.sgstAmount) +
    toNumber(item.cgstAmount) +
    toNumber(item.igstAmount)
  );
}

/**
 * `{prefix}-{YYYYMMDD}-{padded sequence}`, e.g. `MJJ-20260904-0001` — unlike
 * the old `{prefix}-{year}-{padded count}` shape, the full date is encoded
 * directly into the number so it's readable at a glance without opening the
 * invoice (same reasoning as the support ticket number's own date/time
 * encoding — see generateTicketNumber in support-ticket-actions.ts). The
 * sequence resets daily rather than yearly to match: `invoiceStartingNo`
 * still seeds the first number of each day, same as it always seeded the
 * first number of each year before.
 */
async function generateInvoiceNumber(storeId: string) {
  const settings = await prisma.businessSettings.findUnique({ where: { storeId } });
  const prefix = settings?.invoicePrefix?.trim() || "INV";
  const startingNo = settings?.invoiceStartingNo ?? 1;
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const prefixPart = `${prefix}-${datePart}-`;
  const count = await prisma.invoice.count({
    where: {
      storeId,
      invoiceNumber: { startsWith: prefixPart },
    },
  });

  return `${prefixPart}${String(count + startingNo).padStart(4, "0")}`;
}

/**
 * One line item as the UI sees it. `mapInvoice` takes `any`, so without
 * naming this the mapped items came out as `any[]` and every consumer's
 * `.map(item => ...)` callback was an implicit any.
 */
export type InvoiceItemView = {
  id: string;
  itemName: string;
  metalTypeId: string | null;
  purity: PurityType | null;
  quantity: number;
  grossWeight: number | null;
  netWeight: number | null;
  caratWeight: number | null;
  rate: number | null;
  makingCharge: number;
  makingChargeType: ChargeType;
  stoneCharge: number;
  stoneRate: number | null;
  stoneMetalTypeName: string | null;
  stoneTypeNames: string | null;
  dmoWeight: number | null;
  stoneWeight: number | null;
  hmCharge: number;
  schemeDiscount: number;
  sgstAmount: number;
  cgstAmount: number;
  igstAmount: number;
  gstRateId: string | null;
  gstRateName: string | null;
  gstRatePercent: number | null;
  hsnCode: string | null;
  lineTotal: number;
  inventoryStockId: string | null;
};

function mapInvoice(invoice: any) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    status: invoice.status as InvoiceStatus,
    subtotal: Number(invoice.subtotal),
    makingCharges: Number(invoice.makingCharges),
    stoneCharges: Number(invoice.stoneCharges),
    discount: Number(invoice.discount),
    taxAmount: Number(invoice.taxAmount),
    totalAmount: Number(invoice.totalAmount),
    paidAmount: Number(invoice.paidAmount),
    balanceAmount: Number(invoice.balanceAmount),
    notes: invoice.notes,
    locationId: invoice.locationId ?? null,
    locationName: invoice.location?.name ?? null,
    gstRateId: invoice.gstRateId ?? null,
    gstRateName: invoice.gstRateName ?? null,
    gstRatePercent: invoice.gstRatePercent != null ? Number(invoice.gstRatePercent) : null,
    ewayBillNumber: invoice.ewayBillNumber ?? null,
    ewayBillDate: invoice.ewayBillDate?.toISOString() ?? null,
    transporterName: invoice.transporterName ?? null,
    vehicleNumber: invoice.vehicleNumber ?? null,
    transportMode: (invoice.transportMode ?? null) as TransportMode | null,
    distanceKm: invoice.distanceKm ?? null,
    createdByName: invoice.createdByName ?? invoice.createdBy?.name ?? null,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    cancelledByName: invoice.cancelledByName ?? invoice.cancelledBy?.name ?? null,
    cancellationReason: invoice.cancellationReason ?? null,
    replaces: invoice.replaces
      ? { id: invoice.replaces.id, invoiceNumber: invoice.replaces.invoiceNumber }
      : null,
    replacedBy: invoice.replacedBy
      ? { id: invoice.replacedBy.id, invoiceNumber: invoice.replacedBy.invoiceNumber }
      : null,
    customer: invoice.customer
      ? {
          id: invoice.customer.id,
          name: invoice.customer.name,
          phone: invoice.customer.phone,
          gstin: invoice.customer.gstin ?? null,
          panNumber: invoice.customer.panNumber ?? null,
          registrationId: invoice.customer.registrationId ?? null,
          addressLine1: invoice.customer.addressLine1 ?? null,
          addressLine2: invoice.customer.addressLine2 ?? null,
          city: invoice.customer.city ?? null,
          state: invoice.customer.state ?? null,
          pincode: invoice.customer.pincode ?? null,
        }
      : null,
    // Cast the array, not just the callback: `.map()` on an `any` returns
    // `any` whatever the callback is annotated to produce, so without this
    // the typed item shape never reaches consumers.
    items: ((invoice.items ?? []) as any[]).map((item): InvoiceItemView => ({
      id: item.id,
      itemName: item.itemName,
      metalTypeId: item.metalTypeId,
      purity: item.purity,
      quantity: item.quantity,
      grossWeight: item.grossWeight ? Number(item.grossWeight) : null,
      netWeight: item.netWeight ? Number(item.netWeight) : null,
      caratWeight: item.caratWeight ? Number(item.caratWeight) : null,
      rate: item.rate ? Number(item.rate) : null,
      makingCharge: Number(item.makingCharge),
      makingChargeType: item.makingChargeType as ChargeType,
      stoneCharge: Number(item.stoneCharge),
      stoneRate: item.stoneRate ? Number(item.stoneRate) : null,
      stoneMetalTypeName: item.stoneMetalTypeName ?? null,
      stoneTypeNames: item.stoneTypeNames ?? null,
      dmoWeight: item.dmoWeight ? Number(item.dmoWeight) : null,
      stoneWeight: item.stoneWeight ? Number(item.stoneWeight) : null,
      hmCharge: Number(item.hmCharge ?? 0),
      schemeDiscount: Number(item.schemeDiscount ?? 0),
      sgstAmount: Number(item.sgstAmount ?? 0),
      cgstAmount: Number(item.cgstAmount ?? 0),
      igstAmount: Number(item.igstAmount ?? 0),
      gstRateId: item.gstRateId ?? null,
      gstRateName: item.gstRateName ?? null,
      gstRatePercent: item.gstRatePercent ? Number(item.gstRatePercent) : null,
      hsnCode: item.hsnCode ?? null,
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
    })),
    convertedFromKacha: invoice.convertedFromKacha
      ? {
          id: invoice.convertedFromKacha.id,
          slipNumber: invoice.convertedFromKacha.slipNumber,
        }
      : null,
    // Fetched via `include` but unused until the print view — the "Payment
    // Details" block reads a payment's method/reference/bank the same way
    // recordInvoicePayment's dual-method split writes them.
    ledgerEntries: ((invoice.ledgerEntries ?? []) as any[]).map((entry) => ({
      id: entry.id,
      entryDate: entry.entryDate.toISOString(),
      amount: Number(entry.amount),
      paymentMethod: entry.paymentMethod as PaymentMethod | null,
      paymentReference: entry.paymentReference as string | null,
      bankName: entry.bankName as string | null,
    })),
  };
}

export type InvoiceSortField = "invoiceDate" | "invoiceNumber" | "totalAmount";

const INVOICE_SORT_FIELDS: InvoiceSortField[] = ["invoiceDate", "invoiceNumber", "totalAmount"];

function isInvoiceSortField(value: unknown): value is InvoiceSortField {
  return INVOICE_SORT_FIELDS.includes(value as InvoiceSortField);
}

export type GetInvoicesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: InvoiceStatus | "ALL" | string;
  sortBy?: InvoiceSortField | string;
  sortOrder?: "asc" | "desc";
};

type InvoiceQueryParams = {
  search?: string;
  status?: InvoiceStatus | "ALL" | string;
  sortBy?: InvoiceSortField | string;
  sortOrder?: "asc" | "desc" | string;
  selectedIds?: string[];
};

/**
 * Shared where/orderBy builder for the invoice list and the export action,
 * so the two never drift apart on what "the filtered set" means.
 */
function buildInvoiceQuery(params: InvoiceQueryParams, storeId: string, scope: LocationScope) {
  const search = String(params.search || "").trim();
  const status =
    params.status && params.status !== "ALL" && params.status in InvoiceStatus
      ? (params.status as InvoiceStatus)
      : undefined;
  const sortBy = isInvoiceSortField(params.sortBy) ? params.sortBy : "invoiceDate";
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc";
  const selectedIds = params.selectedIds?.filter(Boolean) ?? [];

  const where = {
    storeId,
    ...locationWhere(scope),
    ...(selectedIds.length ? { id: { in: selectedIds } } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { invoiceNumber: { contains: search, mode: "insensitive" as const } },
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const orderBy = { [sortBy]: sortOrder } as const;

  return { where, orderBy };
}

export async function getInvoices(params: GetInvoicesParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));

  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const { where, orderBy } = buildInvoiceQuery(params, storeId, scope);

  const [totalCount, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        convertedFromKacha: { select: { id: true, slipNumber: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    invoices: invoices.map(mapInvoice),
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

export type ExportInvoicesParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: string;
};

export type ExportInvoicesResult = {
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
};

/** Exports the same filtered/sorted set the Invoices list is currently showing. */
export async function exportInvoicesToExcel(
  params: ExportInvoicesParams = {},
): Promise<ExportInvoicesResult> {
  try {
    const storeId = await requireStoreScope();
    const scope = await getLocationScope();
    const { where, orderBy } = buildInvoiceQuery(params, storeId, scope);

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        convertedFromKacha: { select: { id: true, slipNumber: true } },
      },
    });

    if (!invoices.length) {
      return { success: false, message: "No invoices found to export." };
    }

    const rows = invoices.map(mapInvoice).map((invoice, index) => ({
      "Sr. No.": index + 1,
      "Invoice #": invoice.invoiceNumber,
      Date: formatShortDate(invoice.invoiceDate),
      Customer: invoice.customer?.name || "",
      Status: invoice.status,
      Subtotal: invoice.subtotal,
      "Making Charges": invoice.makingCharges,
      "Stone Charges": invoice.stoneCharges,
      Discount: invoice.discount,
      Tax: invoice.taxAmount,
      Total: invoice.totalAmount,
      Paid: invoice.paidAmount,
      Balance: invoice.balanceAmount,
    }));

    const { fileName, fileBase64 } = buildExcelExport(rows, "Invoices", "invoices");

    return { success: true, message: "Invoices exported successfully.", fileName, fileBase64 };
  } catch (error) {
    console.error("exportInvoicesToExcel error:", error);
    return { success: false, message: "Failed to export invoices." };
  }
}

export async function getInvoiceById(id: string) {
  const storeId = await requireStoreScope();

  const invoice = await prisma.invoice.findFirst({
    where: { id, storeId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          gstin: true,
          panNumber: true,
          registrationId: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          pincode: true,
        },
      },
      createdBy: { select: { name: true, email: true } },
      cancelledBy: { select: { name: true, email: true } },
      items: true,
      ledgerEntries: { orderBy: { entryDate: "desc" } },
      convertedFromKacha: { select: { id: true, slipNumber: true } },
      replaces: { select: { id: true, invoiceNumber: true } },
      replacedBy: { select: { id: true, invoiceNumber: true } },
      location: { select: { name: true } },
    },
  });

  if (!invoice) return null;
  const mapped = mapInvoice(invoice);

  // Generated fresh every load, same as the stock QR (no stored column) —
  // just scans straight to this invoice's own detail page. Folded in here
  // (rather than left as inline page code) so every caller of
  // getInvoiceById gets it for free, including a client-fetched detail
  // panel that has no server-only env var access of its own.
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const qrDataUrl = await QRCode.toDataURL(`${baseUrl}/billing/${mapped.id}`);

  return { ...mapped, qrDataUrl };
}

export type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoiceById>>>;

export type CustomerSaleInvoiceOption = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  balanceAmount: number;
};

export type CustomerReturnableInvoices = {
  /** Any non-cancelled sale invoice at all — gates whether Refund/Replace
   * show up on the customer's ledger at all, regardless of whether one
   * currently qualifies for either specific action below. */
  hasAnyInvoice: boolean;
  /** Eligible for Return Items (ReturnItemsDialog) — same rule as the
   * invoice detail page's own isReturnable && returnEligibility.eligible. */
  refundable: CustomerSaleInvoiceOption[];
  /** Eligible for Return & Exchange (CancelInvoiceDialog) — same rule as
   * the invoice detail page's own isCancellable. */
  replaceable: CustomerSaleInvoiceOption[];
};

/**
 * Feeds the customer ledger's Refund/Replace invoice pickers — same
 * eligibility rules the invoice detail page already uses to decide whether
 * to show its own "Return Items" / "Return & Exchange" actions, just
 * evaluated across every one of this customer's invoices at once instead
 * of the one currently open.
 */
export async function getCustomerReturnableInvoices(
  customerId: string,
): Promise<CustomerReturnableInvoices> {
  const storeId = await requireStoreScope();

  const [invoices, settings] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId, storeId, status: { not: InvoiceStatus.CANCELLED } },
      orderBy: { invoiceDate: "desc" },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        totalAmount: true,
        balanceAmount: true,
        status: true,
      },
    }),
    getBusinessSettings(),
  ]);

  const toOption = (invoice: (typeof invoices)[number]): CustomerSaleInvoiceOption => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: formatShortDate(invoice.invoiceDate),
    totalAmount: Number(invoice.totalAmount),
    balanceAmount: Number(invoice.balanceAmount),
  });

  const refundable =
    settings.returnWindowDays > 0
      ? invoices
          .filter(
            (invoice) =>
              (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.PARTIAL) &&
              getReturnEligibility(invoice.invoiceDate, settings.returnWindowDays).eligible,
          )
          .map(toOption)
      : [];

  const replaceable = invoices
    .filter(
      (invoice) => invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.PARTIAL,
    )
    .map(toOption);

  return { hasAnyInvoice: invoices.length > 0, refundable, replaceable };
}

/** Lightweight customer list for the invoice form's customer picker. */
export async function getInvoiceFormCustomers() {
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

/** In-stock items available to attach to an invoice line item. */
/**
 * `includeInvoiceId` is for the edit page: a line already linked to a
 * stock row that this same invoice sold out to zero (flipped SOLD) would
 * otherwise be invisible here — IN_STOCK-only — even though editing will
 * restore it first. Included rows get their quantity boosted by exactly
 * what this invoice's own items already claim of them, so the picker
 * shows "available to re-select" as if that restoration had already
 * happened, matching what updateInvoice's full-edit path actually does.
 */
export async function getInvoiceFormStockItems(includeInvoiceId?: string) {
  const storeId = await requireStoreScope();

  const stockItems = await prisma.inventoryStock.findMany({
    where: { storeId, status: InventoryStockStatus.IN_STOCK, isActive: true },
    orderBy: { stockCode: "asc" },
    include: {
      product: { select: { name: true, hsnCode: true, productCode: true } },
      metalType: { select: { id: true, name: true } },
    },
  });

  const mapped = stockItems.map((stock) => ({
    id: stock.id,
    stockCode: stock.stockCode,
    productName: stock.product.name,
    productCode: stock.product.productCode,
    hsnCode: stock.product.hsnCode,
    metalType: stock.metalType
      ? { id: stock.metalType.id, name: stock.metalType.name }
      : null,
    purity: stock.purity,
    grossWeight: stock.grossWeight ? Number(stock.grossWeight) : null,
    netWeight: stock.netWeight ? Number(stock.netWeight) : null,
    stoneWeight: stock.stoneWeight ? Number(stock.stoneWeight) : null,
    caratWeight: stock.caratWeight ? Number(stock.caratWeight) : null,
    stoneRate: stock.stoneRate ? Number(stock.stoneRate) : null,
    stoneMetalTypeName: stock.stoneMetalTypeName ?? null,
    stoneTypeNames: stock.stoneTypeNames ?? null,
    saleRate: stock.saleRate ? Number(stock.saleRate) : null,
    quantity: stock.quantity,
  }));

  if (!includeInvoiceId) return mapped;

  const currentItems = await prisma.invoiceItem.findMany({
    where: { invoiceId: includeInvoiceId, inventoryStockId: { not: null } },
    select: { inventoryStockId: true, quantity: true },
  });
  const claimedByThisInvoice = new Map<string, number>();
  for (const item of currentItems) {
    if (!item.inventoryStockId) continue;
    claimedByThisInvoice.set(
      item.inventoryStockId,
      (claimedByThisInvoice.get(item.inventoryStockId) ?? 0) + Math.max(1, item.quantity || 1),
    );
  }
  if (claimedByThisInvoice.size === 0) return mapped;

  const byId = new Map(mapped.map((stock) => [stock.id, stock]));
  for (const [stockId, claimed] of claimedByThisInvoice) {
    const existing = byId.get(stockId);
    if (existing) {
      existing.quantity += claimed;
      continue;
    }
    // Not in the IN_STOCK list at all (fully SOLD) — fetch it directly.
    const stock = await prisma.inventoryStock.findFirst({
      where: { id: stockId, storeId },
      include: {
        product: { select: { name: true, hsnCode: true, productCode: true } },
        metalType: { select: { id: true, name: true } },
      },
    });
    if (!stock) continue;
    mapped.push({
      id: stock.id,
      stockCode: stock.stockCode,
      productName: stock.product.name,
      productCode: stock.product.productCode,
      hsnCode: stock.product.hsnCode,
      metalType: stock.metalType ? { id: stock.metalType.id, name: stock.metalType.name } : null,
      purity: stock.purity,
      grossWeight: stock.grossWeight ? Number(stock.grossWeight) : null,
      netWeight: stock.netWeight ? Number(stock.netWeight) : null,
      stoneWeight: stock.stoneWeight ? Number(stock.stoneWeight) : null,
      caratWeight: stock.caratWeight ? Number(stock.caratWeight) : null,
      stoneRate: stock.stoneRate ? Number(stock.stoneRate) : null,
      stoneMetalTypeName: stock.stoneMetalTypeName ?? null,
      stoneTypeNames: stock.stoneTypeNames ?? null,
      saleRate: stock.saleRate ? Number(stock.saleRate) : null,
      quantity: stock.quantity + claimed,
    });
  }

  return mapped;
}

/**
 * Create an invoice with its line items in one transaction. Any line item
 * linked to an InventoryStock row gets marked SOLD and a SALE transaction
 * is logged against it. If the invoice isn't fully paid up front, a DEBIT
 * ledger entry is recorded against the customer for the outstanding amount.
 * Whatever IS paid up front (via paymentsJson's 1-2 method rows) gets its
 * own CREDIT ledger entry per row, same shape recordInvoicePayment writes.
 */
export async function createInvoice(
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    const customerId = String(formData.get("customerId") || "");
    const itemsRaw = String(formData.get("itemsJson") || "[]");

    if (!customerId) {
      return { success: false, message: "Please select a customer" };
    }

    let items: InvoiceLineItemInput[] = [];
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return { success: false, message: "Invalid line items" };
    }

    if (!items.length) {
      return { success: false, message: "Add at least one line item" };
    }

    // Selling price is what an invoice actually charges for — a line with
    // no rate at all is not a valid sale, and the client-side check on the
    // form is only a convenience; this is the real guarantee. Checked
    // before any other parsing so a $0 line never reaches stock/ledger
    // writes below.
    const invalidRateItem = items.find((item) => !(toNumber(item.rate) > 0));
    if (invalidRateItem) {
      return {
        success: false,
        message: `Enter a selling price for "${invalidRateItem.itemName || "an item"}" before creating the invoice.`,
      };
    }

    const manualDiscount = toNumber(formData.get("discount"));

    // paymentsJson (1-2 method rows, or none for a fully-on-credit sale) is
    // what invoice-form.tsx's "Paid Now" section sends. A caller that
    // doesn't send it at all (quick-sale-actions.ts's scan-to-sell flow,
    // which only collects a flat figure with no method breakdown) falls
    // back to the legacy plain `paidAmount` field exactly as before — no
    // method-tagged LedgerEntry gets created for that path, unchanged.
    const paymentsRaw = formData.get("paymentsJson");
    const payments = paymentsRaw !== null ? parseOptionalPayments(String(paymentsRaw)) : [];
    if (payments === null) {
      return {
        success: false,
        message: "Add 1-2 valid payment methods with an amount, or leave Paid Now blank for a fully-on-credit sale.",
      };
    }
    const paidAmount =
      paymentsRaw !== null
        ? payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
        : toNumber(formData.get("paidAmount"));
    const invoiceDateRaw = String(formData.get("invoiceDate") || "");
    const dueDateRaw = String(formData.get("dueDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;
    const locationId = String(formData.get("locationId") || "").trim() || null;
    const replacesId = String(formData.get("replacesId") || "").trim() || null;
    const gstRateId = String(formData.get("gstRateId") || "").trim() || null;

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.rate) * lineQuantity(item),
      0,
    );
    // Hallmarking charge folds into the invoice's Making Charges total — the
    // printed format shows it as a sub-line under Making Charges, not a
    // separate money bucket.
    const makingCharges = items.reduce(
      (sum, item) => sum + toNumber(item.makingCharge) + toNumber(item.hmCharge),
      0,
    );
    const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
    // Per-line scheme/discount folds into the invoice's single `discount`
    // total alongside whatever was typed at invoice level, so every existing
    // reader of Invoice.discount (reports, the detail page, the
    // subtotal+making+stone-discount+tax invariant) still adds up without
    // needing to know per-line discounts exist.
    const discount =
      manualDiscount + items.reduce((sum, item) => sum + toNumber(item.schemeDiscount), 0);
    // Recomputed from each line's own sgst/cgst/igst rather than trusted
    // from a single form field — the per-line breakdown is the source of
    // truth the printed invoice shows, so the saved total must match it
    // exactly. sgst+cgst (intra-state) and igst (inter-state) are never
    // both nonzero on the same line — see computeGst() in lib/gst.ts — so
    // summing all three here is safe either way.
    const taxAmount = items.reduce(
      (sum, item) =>
        sum + toNumber(item.sgstAmount) + toNumber(item.cgstAmount) + toNumber(item.igstAmount),
      0,
    );
    const totalAmount = subtotal + makingCharges + stoneCharges - discount + taxAmount;
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    let status: InvoiceStatus = InvoiceStatus.PAID;
    if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
    else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;

    // A caller may name the store explicitly — the QR scan-to-sell path does,
    // because it resolves the shop from the scanned piece rather than from
    // whichever store the phone happened to have active. `resolveActingStoreId`
    // honours it only for a store the user is genuinely a member of, so this
    // is no weaker than the store switcher; with nothing named it falls back
    // to the active store exactly as before.
    const storeId = await resolveActingStoreId(
      String(formData.get("storeId") || "") || null,
    );

    // Re-resolved against the store's own current GstRate row rather than
    // trusted from the client — see resolveGstRateSnapshot's own doc
    // comment. A missing/invalid id (e.g. a Composition-scheme document,
    // which never selects a rate) just leaves the snapshot null instead of
    // failing the save.
    const gstRateSnapshot = await resolveGstRateSnapshot(storeId, gstRateId);

    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it. Checked against `storeId`
    // rather than the active store, because a caller may name a different one
    // above — being a member of that store is not the same as being allowed
    // to bill in it.
    let actor;
    try {
      actor = await requirePermissionInStore(PERMISSIONS.BILLING_CREATE, storeId);
    } catch {
      return {
        success: false,
        message: "You do not have permission to create invoices in this store.",
      };
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true },
    });
    if (!customer) {
      return { success: false, message: "Please select a customer" };
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
      items.some(
        (item) =>
          toNumber(item.sgstAmount) !== 0 ||
          toNumber(item.cgstAmount) !== 0 ||
          toNumber(item.igstAmount) !== 0,
      )
    ) {
      return {
        success: false,
        message: "This store is on the Composition Scheme and cannot charge GST on an invoice.",
      };
    }

    // See resolveWritableLocationId's own doc comment — without this, a
    // location-restricted Staff user submitting no location at all (the
    // picker always offers "None") saved the invoice with locationId: null,
    // which then never matches their own location-scoped list afterward.
    const locationScope = await getLocationScope();
    const locationResolution = await resolveWritableLocationId(storeId, locationId, locationScope);
    if (!locationResolution.ok) {
      return { success: false, message: locationResolution.message };
    }
    const resolvedLocationId = locationResolution.locationId;

    // A replacement invoice may only target a cancelled invoice in this
    // store that hasn't already been replaced — replacesId's @unique
    // constraint would reject a second one anyway, but this surfaces a
    // real message instead of a raw DB constraint error.
    if (replacesId) {
      const replaced = await prisma.invoice.findFirst({
        where: { id: replacesId, storeId },
        select: { status: true, replacedBy: { select: { id: true } } },
      });
      if (!replaced || replaced.status !== InvoiceStatus.CANCELLED) {
        return { success: false, message: "The invoice being replaced must be a cancelled invoice" };
      }
      if (replaced.replacedBy) {
        return { success: false, message: "That cancelled invoice has already been replaced" };
      }
    }

    // Every referenced stock item must belong to this store — otherwise a
    // crafted itemsJson could link a line item to another store's stock,
    // leaking its details (and, via the SOLD-status update below, its
    // invoice/customer info) into this invoice.
    const requestedStockIds = [
      ...new Set(items.map((item) => item.inventoryStockId).filter((id): id is string => !!id)),
    ];
    const validStock = requestedStockIds.length
      ? await prisma.inventoryStock.findMany({
          where: { id: { in: requestedStockIds }, storeId },
          select: { id: true, stockCode: true, quantity: true },
        })
      : [];
    const validStockIds = new Set(validStock.map((s) => s.id));

    // A stock row can hold many pieces (qty 100 of a stud, say). Selling
    // some of them must not be allowed to exceed what is on hand, and two
    // line items can point at the same row, so the check sums per row
    // rather than looking at each line in isolation.
    const requestedQtyByStock = new Map<string, number>();
    for (const item of items) {
      if (!item.inventoryStockId || !validStockIds.has(item.inventoryStockId)) continue;
      requestedQtyByStock.set(
        item.inventoryStockId,
        (requestedQtyByStock.get(item.inventoryStockId) ?? 0) + Math.max(1, item.quantity || 1),
      );
    }

    for (const stock of validStock) {
      const wanted = requestedQtyByStock.get(stock.id) ?? 0;
      if (wanted > stock.quantity) {
        return {
          success: false,
          message: `Only ${stock.quantity} left of stock ${stock.stockCode}, but ${wanted} were billed.`,
        };
      }
    }

    const invoiceNumber = await generateInvoiceNumber(storeId);

    // Resolved once, up front, for every DISTINCT rate any line actually
    // uses — see resolvePerLineGstRateSnapshots' own doc comment. Must
    // happen before the transaction below since a nested Prisma `create`
    // array has to be plain objects, not promises.
    const perLineGstRateSnapshots = await resolvePerLineGstRateSnapshots(storeId, items);

    // Default interactive-transaction timeout is 5s — a multi-line invoice
    // does several sequential awaits per item (stock update, ledger entry,
    // inventory transaction) inside this one callback, which reliably blows
    // past 5s and throws P2028 ("Transaction not found") on a real (non-local)
    // DB connection. Same fix as createPurchase's identical transaction.
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          storeId,
          invoiceNumber,
          customerId,
          invoiceDate: invoiceDateRaw ? new Date(invoiceDateRaw) : new Date(),
          dueDate: dueDateRaw ? new Date(dueDateRaw) : undefined,
          status,
          subtotal,
          makingCharges,
          stoneCharges,
          discount,
          taxAmount,
          totalAmount,
          paidAmount,
          balanceAmount,
          notes,
          locationId: resolvedLocationId ?? undefined,
          gstRateId: gstRateSnapshot?.gstRateId ?? undefined,
          gstRateName: gstRateSnapshot?.gstRateName ?? undefined,
          gstRatePercent: gstRateSnapshot?.gstRatePercent ?? undefined,
          // Recorded at the moment of sale, name included, so the invoice
          // still says who raised it after that person leaves the shop.
          createdById: actor.id ?? null,
          createdByName: actor.name ?? actor.email ?? null,
          replacesId: replacesId ?? undefined,
          items: {
            create: items.map((item) => ({
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
              quantity: item.quantity || 1,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
              caratWeight: item.caratWeight ?? undefined,
              rate: item.rate ?? undefined,
              makingCharge: item.makingCharge,
              makingChargeType: toChargeType(item.makingChargeType),
              stoneCharge: item.stoneCharge,
              stoneRate: item.stoneRate ?? undefined,
              stoneMetalTypeName: item.stoneMetalTypeName ?? undefined,
              stoneTypeNames: item.stoneTypeNames ?? undefined,
              dmoWeight: item.dmoWeight ?? undefined,
              stoneWeight: item.stoneWeight ?? undefined,
              hmCharge: item.hmCharge ?? 0,
              schemeDiscount: item.schemeDiscount ?? 0,
              sgstAmount: item.sgstAmount ?? 0,
              cgstAmount: item.cgstAmount ?? 0,
              igstAmount: item.igstAmount ?? 0,
              // This LINE's own resolved snapshot, distinct from the
              // invoice-level gstRateSnapshot above — see InvoiceItem's
              // gstRateId doc comment. `undefined` (not `null`) to match
              // this function's existing optional-relation convention.
              gstRateId: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateId ?? undefined
                : undefined,
              gstRateName: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateName ?? undefined
                : undefined,
              gstRatePercent: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRatePercent ?? undefined
                : undefined,
              hsnCode: item.hsnCode ?? undefined,
              lineTotal: lineTotal(item),
              inventoryStockId:
                item.inventoryStockId && validStockIds.has(item.inventoryStockId)
                  ? item.inventoryStockId
                  : undefined,
            })),
          },
        },
      });

      for (const item of items) {
        if (!item.inventoryStockId || !validStockIds.has(item.inventoryStockId)) continue;

        // Decrement rather than flipping the whole row to SOLD: a row of
        // 100 pieces that sells 2 still has 98 on hand. Marking it SOLD
        // outright made the remainder disappear from stock entirely.
        const soldQty = Math.max(1, item.quantity || 1);

        // The `quantity: { gte: soldQty }` guard — not the earlier
        // requestedQtyByStock pre-check above — is what actually prevents
        // overselling: two concurrent invoices for the same row can both
        // pass that pre-check (it reads quantity before either has
        // decremented anything) and then both land here. The database
        // evaluates this WHERE clause against the row's real, current
        // quantity, so only one of two racing decrements past the last
        // unit can ever match; the other gets count: 0. A stale JS-side
        // `quantity` read beforehand (the previous version of this code)
        // can never provide that guarantee.
        const { count } = await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId, quantity: { gte: soldQty } },
          data: {
            quantity: { decrement: soldQty },
            saleAmount: lineTotal(item),
          },
        });

        if (count === 0) {
          // Thrown, not returned — this must roll back the whole
          // transaction (including every other line item's decrement
          // already applied above), not create a partial invoice.
          throw new OversellError(
            `Not enough stock left for ${item.itemName || "an item"} — it may have just been sold in another sale. Refresh and try again.`,
          );
        }

        // Only the last piece leaving turns the row SOLD — read the
        // post-decrement quantity back rather than computing it from the
        // pre-decrement value, since that value is exactly what the guard
        // above proved cannot be trusted under concurrency.
        const updatedStock = await tx.inventoryStock.findUniqueOrThrow({
          where: { id: item.inventoryStockId },
          select: { quantity: true, status: true },
        });
        if (updatedStock.quantity <= 0 && updatedStock.status !== InventoryStockStatus.SOLD) {
          await tx.inventoryStock.update({
            where: { id: item.inventoryStockId },
            data: { status: InventoryStockStatus.SOLD },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE,
            quantity: soldQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: created.id,
          },
        });
      }

      if (balanceAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.SALE,
            customerId,
            invoiceId: created.id,
            amount: balanceAmount,
            description: `Invoice ${invoiceNumber} balance due`,
            locationId: resolvedLocationId ?? undefined,
          },
        });
      }

      // One CREDIT entry per payment-method row actually collected at the
      // moment of sale — same shape recordInvoicePayment writes for a later
      // top-up payment, so the two are indistinguishable in the ledger
      // besides their timestamp.
      for (const [index, payment] of payments.entries()) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.PAYMENT_IN,
            customerId,
            invoiceId: created.id,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
            locationId: resolvedLocationId ?? undefined,
            description: index === 0 ? `Payment received for ${invoiceNumber}` : undefined,
          },
        });
      }

      return created;
    }, { timeout: 15000 });

    revalidatePath("/billing");

    return {
      success: true,
      message: `Invoice ${invoiceNumber} created`,
      invoiceId: invoice.id,
    };
  } catch (error) {
    if (error instanceof OversellError) {
      return { success: false, message: error.message };
    }
    console.error("createInvoice error:", error);
    return { success: false, message: "Failed to create invoice" };
  }
}

/**
 * Record a payment against an invoice's outstanding balance. Reduces
 * balanceAmount, bumps paidAmount, updates status, and logs a CREDIT
 * ledger entry (money coming in reduces what the customer owes).
 */
export async function recordInvoicePayment(
  invoiceId: string,
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to record payments." };
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

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, storeId } });
    if (!invoice) return { success: false, message: "Invoice not found" };

    const newPaid = Number(invoice.paidAmount) + amount;
    const newBalance = Math.max(0, Number(invoice.totalAmount) - newPaid);
    const status: InvoiceStatus =
      newBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { paidAmount: newPaid, balanceAmount: newBalance, status },
      }),
      ...payments.map((payment, index) =>
        prisma.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.PAYMENT_IN,
            customerId: invoice.customerId,
            invoiceId,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
            locationId: invoice.locationId ?? undefined,
            description:
              notes ??
              (index === 0 ? `Payment received for ${invoice.invoiceNumber}` : undefined),
          },
        }),
      ),
    ]);

    revalidatePath("/billing");
    revalidatePath(`/billing/${invoiceId}`);

    return { success: true, message: "Payment recorded" };
  } catch (error) {
    console.error("recordInvoicePayment error:", error);
    return { success: false, message: "Failed to record payment" };
  }
}

/**
 * Edit an invoice's non-financial fields only — invoice date, due date,
 * location, and notes. Line items, amounts, and payments are never
 * touched here on purpose: once stock has been decremented and ledger
 * entries posted, changing those needs the same reversal logic Cancel
 * already does, not a quiet in-place edit. A real correction goes through
 * cancelInvoice + a replacement invoice instead.
 */
/**
 * Two edit paths in one action, branched on whether `itemsJson` is present
 * in `formData`:
 *
 * - Absent → basic fields only (invoice date, due date, location, notes).
 *   Used by EditInvoiceDialog, available on any non-CANCELLED invoice
 *   (this is the only edit a PAID invoice ever gets).
 * - Present → full line-item edit (price/quantity/rate/making/stone/
 *   everything), used by the /billing/[id]/edit page. Only available on
 *   DRAFT/PARTIAL — same restriction cancelInvoice already has, same
 *   reason: a PAID invoice means money was actually collected, and
 *   silently changing its total needs a real refund decision. Reverses
 *   every old line's stock effect and reapplies the new lines' the same
 *   guarded way createInvoice/cancelInvoice already do, then reconciles
 *   the ledger with one offsetting entry sized to the actual balance
 *   delta — existing payment entries are never touched or rewritten.
 */
export async function updateInvoice(
  id: string,
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    try {
      await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to edit invoices." };
    }

    const storeId = await requireStoreScope();
    const invoice = await prisma.invoice.findFirst({
      where: { id, storeId },
      include: { items: true },
    });
    if (!invoice) return { success: false, message: "Invoice not found" };

    if (invoice.status === InvoiceStatus.CANCELLED) {
      return {
        success: false,
        message: "Cancelled invoices can't be edited — create a replacement instead.",
      };
    }

    const invoiceDateRaw = String(formData.get("invoiceDate") || "");
    const dueDateRaw = String(formData.get("dueDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;
    const locationId = String(formData.get("locationId") || "").trim() || null;

    // E-way Bill — record-keeping only, no government API call. See the
    // schema's own doc comment on Invoice.ewayBillNumber.
    const ewayBillNumber = String(formData.get("ewayBillNumber") || "").trim() || null;
    const ewayBillDateRaw = String(formData.get("ewayBillDate") || "");
    const transporterName = String(formData.get("transporterName") || "").trim() || null;
    const vehicleNumber = String(formData.get("vehicleNumber") || "").trim() || null;
    const transportModeRaw = String(formData.get("transportMode") || "").trim();
    const transportMode = (
      Object.values(TransportMode) as string[]
    ).includes(transportModeRaw)
      ? (transportModeRaw as TransportMode)
      : null;
    const distanceKmRaw = String(formData.get("distanceKm") || "").trim();
    const distanceKm = distanceKmRaw ? Math.trunc(Number(distanceKmRaw)) || null : null;

    const locationScope = await getLocationScope();
    const locationResolution = await resolveWritableLocationId(storeId, locationId, locationScope);
    if (!locationResolution.ok) {
      return { success: false, message: locationResolution.message };
    }
    const resolvedLocationId = locationResolution.locationId;

    const hasItems = formData.has("itemsJson");

    if (!hasItems) {
      await prisma.invoice.update({
        where: { id },
        data: {
          invoiceDate: invoiceDateRaw ? new Date(invoiceDateRaw) : invoice.invoiceDate,
          dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
          notes,
          locationId: resolvedLocationId ?? null,
          ewayBillNumber,
          ewayBillDate: ewayBillDateRaw ? new Date(ewayBillDateRaw) : null,
          transporterName,
          vehicleNumber,
          transportMode,
          distanceKm,
        },
      });

      revalidatePath("/billing");
      revalidatePath(`/billing/${id}`);

      return { success: true, message: "Invoice updated" };
    }

    // --- Full line-item edit ---

    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.PARTIAL) {
      return {
        success: false,
        message: "Only draft or partially-paid invoices can have their line items edited.",
      };
    }

    let items: InvoiceLineItemInput[] = [];
    try {
      items = JSON.parse(String(formData.get("itemsJson") || "[]"));
    } catch {
      return { success: false, message: "Invalid line items" };
    }
    if (!items.length) {
      return { success: false, message: "Add at least one line item" };
    }

    // Same guarantee as createInvoice — a line with no rate at all is not a
    // valid sale, whether the invoice is being created or edited.
    const invalidRateItem = items.find((item) => !(toNumber(item.rate) > 0));
    if (invalidRateItem) {
      return {
        success: false,
        message: `Enter a selling price for "${invalidRateItem.itemName || "an item"}" before saving.`,
      };
    }

    // Same Composition-scheme guard as createInvoice — a store that can't
    // charge GST at creation can't gain it back by editing line items either.
    const businessSettings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { gstScheme: true },
    });
    if (
      businessSettings?.gstScheme === "COMPOSITION" &&
      items.some(
        (item) =>
          toNumber(item.sgstAmount) !== 0 ||
          toNumber(item.cgstAmount) !== 0 ||
          toNumber(item.igstAmount) !== 0,
      )
    ) {
      return {
        success: false,
        message: "This store is on the Composition Scheme and cannot charge GST on an invoice.",
      };
    }

    const manualDiscount = toNumber(formData.get("discount"));
    const gstRateId = String(formData.get("gstRateId") || "").trim() || null;
    // Re-resolved against the store's own current GstRate row rather than
    // trusted from the client — same reasoning as createInvoice.
    const gstRateSnapshot = await resolveGstRateSnapshot(storeId, gstRateId);

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.rate) * lineQuantity(item),
      0,
    );
    const makingCharges = items.reduce(
      (sum, item) => sum + toNumber(item.makingCharge) + toNumber(item.hmCharge),
      0,
    );
    const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
    const discount =
      manualDiscount + items.reduce((sum, item) => sum + toNumber(item.schemeDiscount), 0);
    // sgst+cgst (intra-state) and igst (inter-state) — see createInvoice's
    // identical computation for why summing all three is always safe.
    const taxAmount = items.reduce(
      (sum, item) =>
        sum + toNumber(item.sgstAmount) + toNumber(item.cgstAmount) + toNumber(item.igstAmount),
      0,
    );
    const totalAmount = subtotal + makingCharges + stoneCharges - discount + taxAmount;

    const paidAmount = Number(invoice.paidAmount);
    if (totalAmount < paidAmount) {
      return {
        success: false,
        message: `New total (₹${totalAmount.toFixed(2)}) can't be less than the ₹${paidAmount.toFixed(2)} already paid — record a refund or adjust payments first.`,
      };
    }
    const newBalanceAmount = Math.max(0, totalAmount - paidAmount);

    let newStatus: InvoiceStatus = InvoiceStatus.PAID;
    if (newBalanceAmount > 0 && paidAmount > 0) newStatus = InvoiceStatus.PARTIAL;
    else if (newBalanceAmount > 0 && paidAmount === 0) newStatus = InvoiceStatus.DRAFT;

    // Same store-ownership/oversell validation createInvoice already does,
    // against the new items — old items' own stock hasn't been restored
    // yet at this point, so a row a new line also targets is checked
    // against its current (pre-restore) quantity plus whatever this same
    // invoice already holds there; the transaction below restores old
    // quantities before applying new ones, so the real guard is the
    // `gte`-guarded decrement inside it, same as createInvoice.
    const requestedStockIds = [
      ...new Set(items.map((item) => item.inventoryStockId).filter((sid): sid is string => !!sid)),
    ];
    const validStock = requestedStockIds.length
      ? await prisma.inventoryStock.findMany({
          where: { id: { in: requestedStockIds }, storeId },
          select: { id: true, stockCode: true, quantity: true },
        })
      : [];
    const validStockIds = new Set(validStock.map((s) => s.id));

    // Resolved once, up front, for every DISTINCT rate any line actually
    // uses — see resolvePerLineGstRateSnapshots' own doc comment. Must
    // happen before the transaction below since a nested Prisma `create`
    // array has to be plain objects, not promises.
    const perLineGstRateSnapshots = await resolvePerLineGstRateSnapshots(storeId, items);

    // Same P2028 risk as createInvoice's transaction — two per-item loops
    // (restore old lines' stock, then apply the new lines') easily exceed
    // the default 5s interactive-transaction timeout on a multi-line edit.
    await prisma.$transaction(async (tx) => {
      // 1. Restore every old line's stock first — same as cancelInvoice.
      for (const item of invoice.items) {
        if (!item.inventoryStockId) continue;

        const restoreQty = Math.max(1, item.quantity || 1);

        await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId },
          data: { quantity: { increment: restoreQty } },
        });

        const restoredStock = await tx.inventoryStock.findUnique({
          where: { id: item.inventoryStockId },
          select: { quantity: true, status: true },
        });
        if (
          restoredStock &&
          restoredStock.quantity > 0 &&
          restoredStock.status === InventoryStockStatus.SOLD
        ) {
          await tx.inventoryStock.update({
            where: { id: item.inventoryStockId },
            data: { status: InventoryStockStatus.IN_STOCK },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE_RETURN,
            quantity: restoreQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: invoice.id,
            notes: "Stock restored — invoice edited",
          },
        });
      }

      // 2. Replace the item rows with the new set.
      await tx.invoice.update({
        where: { id },
        data: {
          subtotal,
          makingCharges,
          stoneCharges,
          discount,
          taxAmount,
          totalAmount,
          balanceAmount: newBalanceAmount,
          status: newStatus,
          invoiceDate: invoiceDateRaw ? new Date(invoiceDateRaw) : invoice.invoiceDate,
          dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
          notes,
          locationId: resolvedLocationId ?? null,
          gstRateId: gstRateSnapshot?.gstRateId ?? null,
          gstRateName: gstRateSnapshot?.gstRateName ?? null,
          gstRatePercent: gstRateSnapshot?.gstRatePercent ?? null,
          items: {
            deleteMany: {},
            create: items.map((item) => ({
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
              quantity: item.quantity || 1,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
              caratWeight: item.caratWeight ?? undefined,
              rate: item.rate ?? undefined,
              makingCharge: item.makingCharge,
              makingChargeType: toChargeType(item.makingChargeType),
              stoneCharge: item.stoneCharge,
              stoneRate: item.stoneRate ?? undefined,
              stoneMetalTypeName: item.stoneMetalTypeName ?? undefined,
              stoneTypeNames: item.stoneTypeNames ?? undefined,
              dmoWeight: item.dmoWeight ?? undefined,
              stoneWeight: item.stoneWeight ?? undefined,
              hmCharge: item.hmCharge ?? 0,
              schemeDiscount: item.schemeDiscount ?? 0,
              sgstAmount: item.sgstAmount ?? 0,
              cgstAmount: item.cgstAmount ?? 0,
              igstAmount: item.igstAmount ?? 0,
              // This LINE's own resolved snapshot, distinct from the
              // invoice-level gstRateSnapshot above — see InvoiceItem's
              // gstRateId doc comment. `null` (not `undefined`) to match
              // this function's existing optional-relation convention.
              gstRateId: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateId ?? null
                : null,
              gstRateName: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRateName ?? null
                : null,
              gstRatePercent: item.gstRateId
                ? perLineGstRateSnapshots.get(item.gstRateId)?.gstRatePercent ?? null
                : null,
              hsnCode: item.hsnCode ?? undefined,
              lineTotal: lineTotal(item),
              inventoryStockId:
                item.inventoryStockId && validStockIds.has(item.inventoryStockId)
                  ? item.inventoryStockId
                  : undefined,
            })),
          },
        },
      });

      // 3. Apply the new lines' stock — thrown OversellError here rolls
      // back the restoration above too, leaving the invoice untouched.
      for (const item of items) {
        if (!item.inventoryStockId || !validStockIds.has(item.inventoryStockId)) continue;

        const soldQty = Math.max(1, item.quantity || 1);

        const { count } = await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId, quantity: { gte: soldQty } },
          data: {
            quantity: { decrement: soldQty },
            saleAmount: lineTotal(item),
          },
        });

        if (count === 0) {
          throw new OversellError(
            `Not enough stock left for ${item.itemName || "an item"} — it may have just been sold in another sale. Refresh and try again.`,
          );
        }

        const updatedStock = await tx.inventoryStock.findUniqueOrThrow({
          where: { id: item.inventoryStockId },
          select: { quantity: true, status: true },
        });
        if (updatedStock.quantity <= 0 && updatedStock.status !== InventoryStockStatus.SOLD) {
          await tx.inventoryStock.update({
            where: { id: item.inventoryStockId },
            data: { status: InventoryStockStatus.SOLD },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE,
            quantity: soldQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: invoice.id,
          },
        });
      }

      // 4. One offsetting ledger entry sized to the actual change — never
      // a rewrite of what's already posted. Payments already recorded
      // keep their own CREDIT entries exactly as they are.
      const delta = newBalanceAmount - Number(invoice.balanceAmount);
      if (delta !== 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: delta > 0 ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.SALE,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            amount: Math.abs(delta),
            description: `Invoice ${invoice.invoiceNumber} revised — balance ${delta > 0 ? "increased" : "decreased"}`,
            locationId: resolvedLocationId ?? undefined,
          },
        });
      }
    }, { timeout: 15000 });

    revalidatePath("/billing");
    revalidatePath(`/billing/${id}`);

    return { success: true, message: "Invoice updated", invoiceId: id };
  } catch (error) {
    if (error instanceof OversellError) {
      return { success: false, message: error.message };
    }
    console.error("updateInvoice error:", error);
    return { success: false, message: "Failed to update invoice" };
  }
}

/**
 * Inline Rate/Weight edit for a single line, from the invoice detail
 * page's own item table — a lighter-weight sibling of updateInvoice's
 * full line-item edit, for the common case of just correcting a rate or
 * weight without reopening the whole Edit Items form.
 *
 * Deliberately narrower than the full edit: rate/weight are the only
 * things that can change here, so making/HM/stone charges and this
 * line's schemeDiscount carry over untouched, and — since neither the
 * piece count nor which stock row this line points at ever changes —
 * there's no stock to restore/reapply, unlike updateInvoice's full path.
 *
 * GST is still recomputed, not just left alone: every line on one
 * invoice shares the same GST% (set once, at creation — see
 * invoice-form.tsx's single `gstRate` state), so that % is derived from
 * this line's own pre-edit tax/taxable-value ratio and reapplied to the
 * new taxable value, the same intra-/inter-state split (SGST+CGST vs
 * IGST) as before. That keeps this action independent of business
 * settings/customer state lookups — it only ever needs numbers already
 * sitting on the line being edited.
 */
export async function updateInvoiceLineItem(
  invoiceId: string,
  itemId: string,
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    try {
      await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to edit invoices." };
    }

    const storeId = await requireStoreScope();
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, storeId },
      include: { items: true },
    });
    if (!invoice) return { success: false, message: "Invoice not found" };

    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.PARTIAL) {
      return {
        success: false,
        message: "Only draft or partially-paid invoices can have their line items edited.",
      };
    }

    const item = invoice.items.find((existing) => existing.id === itemId);
    if (!item) return { success: false, message: "Line item not found on this invoice" };

    const rate = toNumber(formData.get("rate"));
    const weight = toNumber(formData.get("weight"));
    if (!(rate > 0)) {
      return { success: false, message: "Enter a selling price greater than 0." };
    }
    if (!(weight > 0)) {
      return { success: false, message: "Enter a weight greater than 0." };
    }

    const isDiamond = item.purity === PurityType.DIAMOND;
    const round = (value: number) => Math.round(value * 100) / 100;

    const oldQuantity = isDiamond ? toNumber(item.caratWeight) : toNumber(item.netWeight);
    const oldTaxable =
      toNumber(item.rate) * oldQuantity +
      toNumber(item.makingCharge) +
      toNumber(item.hmCharge) +
      toNumber(item.stoneCharge) -
      toNumber(item.schemeDiscount);
    const oldTax = toNumber(item.sgstAmount) + toNumber(item.cgstAmount) + toNumber(item.igstAmount);
    const isInterState = toNumber(item.igstAmount) > 0;
    const ratePercent = oldTaxable > 0 ? (oldTax / oldTaxable) * 100 : 0;

    const newTaxable =
      rate * weight +
      toNumber(item.makingCharge) +
      toNumber(item.hmCharge) +
      toNumber(item.stoneCharge) -
      toNumber(item.schemeDiscount);
    const newTax = (newTaxable * ratePercent) / 100;
    const newSgst = isInterState ? 0 : round(newTax / 2);
    const newCgst = isInterState ? 0 : round(newTax / 2);
    const newIgst = isInterState ? round(newTax) : 0;
    const newLineTotal = newTaxable + newSgst + newCgst + newIgst;

    // Only this line's metal value and tax moved — making/HM/stone charges
    // and every other line are untouched, so the invoice-level totals shift
    // by exactly that line's own delta rather than needing a full re-sum
    // across every item.
    const oldLineMetalValue = toNumber(item.rate) * oldQuantity;
    const newLineMetalValue = rate * weight;
    const subtotal = Number(invoice.subtotal) - oldLineMetalValue + newLineMetalValue;
    const taxAmount = Number(invoice.taxAmount) - oldTax + (newSgst + newCgst + newIgst);
    const totalAmount =
      subtotal + Number(invoice.makingCharges) + Number(invoice.stoneCharges) - Number(invoice.discount) + taxAmount;

    const paidAmount = Number(invoice.paidAmount);
    if (totalAmount < paidAmount) {
      return {
        success: false,
        message: `New total (₹${totalAmount.toFixed(2)}) can't be less than the ₹${paidAmount.toFixed(2)} already paid — record a refund or adjust payments first.`,
      };
    }
    const newBalanceAmount = Math.max(0, totalAmount - paidAmount);

    let newStatus: InvoiceStatus = InvoiceStatus.PAID;
    if (newBalanceAmount > 0 && paidAmount > 0) newStatus = InvoiceStatus.PARTIAL;
    else if (newBalanceAmount > 0 && paidAmount === 0) newStatus = InvoiceStatus.DRAFT;

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.update({
        where: { id: itemId },
        data: {
          rate,
          netWeight: isDiamond ? undefined : weight,
          caratWeight: isDiamond ? weight : undefined,
          sgstAmount: newSgst,
          cgstAmount: newCgst,
          igstAmount: newIgst,
          lineTotal: newLineTotal,
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          subtotal,
          taxAmount,
          totalAmount,
          balanceAmount: newBalanceAmount,
          status: newStatus,
        },
      });

      // Same offsetting-entry convention as updateInvoice's full edit —
      // one CREDIT/DEBIT ledger entry sized to the actual balance change,
      // payments already recorded stay exactly as they are.
      const delta = newBalanceAmount - Number(invoice.balanceAmount);
      if (delta !== 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: delta > 0 ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.SALE,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            amount: Math.abs(delta),
            description: `Invoice ${invoice.invoiceNumber} revised — balance ${delta > 0 ? "increased" : "decreased"}`,
            locationId: invoice.locationId ?? undefined,
          },
        });
      }
    });

    revalidatePath("/billing");
    revalidatePath(`/billing/${invoiceId}`);

    return { success: true, message: "Line item updated" };
  } catch (error) {
    console.error("updateInvoiceLineItem error:", error);
    return { success: false, message: "Failed to update line item" };
  }
}

/**
 * Cancel a DRAFT or PARTIAL invoice — restores every stock-linked line's
 * quantity (flipping SOLD back to IN_STOCK where the row had hit zero),
 * and writes off the invoice's current outstanding balance with one
 * offsetting CREDIT ledger entry. Payments already recorded keep their
 * own CREDIT entries untouched — cancelling forgives what's still owed,
 * it doesn't refund money already received. A fully PAID invoice can't be
 * cancelled here on purpose: that needs a real refund decision, not a
 * status flip.
 */
export async function cancelInvoice(
  id: string,
  prevState: InvoiceFormState = initialState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    let actor;
    try {
      actor = await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to cancel invoices." };
    }

    const storeId = await requireStoreScope();
    const invoice = await prisma.invoice.findFirst({
      where: { id, storeId },
      include: { items: true },
    });
    if (!invoice) return { success: false, message: "Invoice not found" };

    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.PARTIAL) {
      return {
        success: false,
        message: "Only draft or partially-paid invoices can be cancelled.",
      };
    }

    const cancellationReason = String(formData.get("cancellationReason") || "").trim() || null;
    const balanceAmount = Number(invoice.balanceAmount);

    // Same P2028 risk as createInvoice/updateInvoice — a per-item restore
    // loop can exceed the default 5s interactive-transaction timeout on a
    // multi-line invoice.
    await prisma.$transaction(async (tx) => {
      for (const item of invoice.items) {
        if (!item.inventoryStockId) continue;

        const restoreQty = Math.max(1, item.quantity || 1);

        // No `gte` guard needed for an increment — there's no way to
        // "over-restore" past what this invoice itself decremented.
        await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId },
          data: { quantity: { increment: restoreQty } },
        });

        // Same principle as createInvoice's stock decrement: trust the
        // post-write read, never a pre-write snapshot, when deciding
        // whether to flip status.
        const updatedStock = await tx.inventoryStock.findUnique({
          where: { id: item.inventoryStockId },
          select: { quantity: true, status: true },
        });
        if (
          updatedStock &&
          updatedStock.quantity > 0 &&
          updatedStock.status === InventoryStockStatus.SOLD
        ) {
          await tx.inventoryStock.update({
            where: { id: item.inventoryStockId },
            data: { status: InventoryStockStatus.IN_STOCK },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE_RETURN,
            quantity: restoreQty,
            netWeight: item.netWeight ?? undefined,
            referenceType: "Invoice",
            referenceId: invoice.id,
            notes: "Stock restored — invoice cancelled",
          },
        });
      }

      // Only the still-outstanding portion needs writing off — any
      // payments already recorded posted their own CREDIT entries and
      // stay exactly as they are; this doesn't touch them.
      if (balanceAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.SALE,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            amount: balanceAmount,
            description: `Invoice ${invoice.invoiceNumber} cancelled — balance written off`,
            locationId: invoice.locationId ?? undefined,
          },
        });
      }

      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.CANCELLED,
          // The offsetting ledger entry above is what explains why this
          // hit zero — totalAmount/paidAmount stay untouched as the
          // historical record of what was billed and actually received.
          balanceAmount: 0,
          cancelledAt: new Date(),
          cancelledById: actor.id ?? null,
          cancelledByName: actor.name ?? actor.email ?? null,
          cancellationReason,
        },
      });
    }, { timeout: 15000 });

    revalidatePath("/billing");
    revalidatePath(`/billing/${id}`);

    return { success: true, message: `Invoice ${invoice.invoiceNumber} cancelled` };
  } catch (error) {
    console.error("cancelInvoice error:", error);
    return { success: false, message: "Failed to cancel invoice" };
  }
}

/** Only DRAFT invoices with no recorded payments/ledger entries can be deleted. */
export async function deleteInvoice(id: string): Promise<InvoiceFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.BILLING_DELETE);
    } catch {
      return { success: false, message: "You do not have permission to delete invoices." };
    }
    const storeId = await requireStoreScope();

    const invoice = await prisma.invoice.findFirst({
      where: { id, storeId },
      include: { ledgerEntries: { select: { id: true }, take: 1 } },
    });

    if (!invoice) return { success: false, message: "Invoice not found" };

    if (invoice.status !== InvoiceStatus.DRAFT || invoice.ledgerEntries.length > 0) {
      return {
        success: false,
        message: "Only draft invoices with no payments can be deleted",
      };
    }

    await prisma.invoice.delete({ where: { id } });
    revalidatePath("/billing");

    return { success: true, message: "Invoice deleted" };
  } catch (error) {
    console.error("deleteInvoice error:", error);
    return { success: false, message: "Failed to delete invoice" };
  }
}

/** Email a formatted copy of this invoice to the customer on file. */
export async function emailInvoiceAction(invoiceId: string): Promise<InvoiceFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.BILLING_VIEW);
    } catch {
      return { success: false, message: "You do not have permission to email invoices." };
    }
    const storeId = await requireStoreScope();

    const [invoice, storeName, settings] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id: invoiceId, storeId },
        include: {
          customer: {
            select: {
              name: true,
              email: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              phone: true,
            },
          },
          items: true,
        },
      }),
      resolveStoreName(storeId),
      getBusinessSettings(),
    ]);

    if (!invoice) return { success: false, message: "Invoice not found" };

    if (!invoice.customer?.email) {
      return { success: false, message: "This customer has no email on file" };
    }

    const { subject, html } = invoiceEmail({
      storeName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      status: invoice.status,
      gstScheme: settings.gstScheme,
      business: {
        name: settings.businessName,
        address: settings.address || null,
        city: settings.city || null,
        state: settings.state || null,
        pincode: settings.pincode || null,
        phone: settings.phone || null,
        gstNumber: settings.gstNumber || null,
        logoUrl: settings.logoUrl || null,
      },
      customer: {
        name: invoice.customer.name,
        addressLine1: invoice.customer.addressLine1,
        addressLine2: invoice.customer.addressLine2,
        city: invoice.customer.city,
        state: invoice.customer.state,
        phone: invoice.customer.phone,
      },
      items: invoice.items.map((item) => ({
        itemName: item.itemName,
        purity: item.purity,
        quantity: item.quantity,
        netWeight: item.netWeight ? Number(item.netWeight) : null,
        rate: item.rate ? Number(item.rate) : null,
        makingCharge: Number(item.makingCharge),
        stoneCharge: Number(item.stoneCharge),
        schemeDiscount: Number(item.schemeDiscount),
        sgstAmount: Number(item.sgstAmount),
        cgstAmount: Number(item.cgstAmount),
        igstAmount: Number(item.igstAmount),
        lineTotal: Number(item.lineTotal),
      })),
      subtotal: Number(invoice.subtotal),
      makingCharges: Number(invoice.makingCharges),
      stoneCharges: Number(invoice.stoneCharges),
      discount: Number(invoice.discount),
      taxAmount: Number(invoice.taxAmount),
      totalAmount: Number(invoice.totalAmount),
      paidAmount: Number(invoice.paidAmount),
      balanceAmount: Number(invoice.balanceAmount),
      amountInWords: amountInWords(Number(invoice.totalAmount)),
      notes: invoice.notes || null,
      terms: settings.invoiceTerms || null,
    });

    const result = await sendMail({ to: invoice.customer.email, subject, html });

    return { success: result.sent, message: result.message };
  } catch (error) {
    console.error("emailInvoiceAction error:", error);
    return { success: false, message: "Failed to email invoice" };
  }
}
