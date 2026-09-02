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
import { requirePermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { requireStoreScope } from "@/lib/store-context";
import {
  getLocationScope,
  locationWhere,
  isLocationAllowed,
  type LocationScope,
} from "@/lib/location-scope";
import { buildExcelExport } from "@/lib/excel-export";
import type {
  DataTableExportParams,
  DataTableExportResult,
} from "@/components/shared/data-table-toolbar";

export type QuotationLineItemInput = {
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
 * prices off netWeight. Duplicated per action file (same convention as the
 * generateXNumber helpers in this codebase) rather than a shared import.
 */
function lineQuantity(item: { purity?: PurityType | null; netWeight?: number | null; caratWeight?: number | null }) {
  return item.purity === PurityType.DIAMOND ? toNumber(item.caratWeight) : toNumber(item.netWeight);
}

function lineTotal(item: QuotationLineItemInput) {
  const metalValue = toNumber(item.rate) * lineQuantity(item);
  return metalValue + toNumber(item.makingCharge) + toNumber(item.stoneCharge);
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
    totalAmount: Number(quotation.totalAmount),
    notes: quotation.notes,
    convertedToId: quotation.convertedToId,
    customer: quotation.customer
      ? {
          id: quotation.customer.id,
          name: quotation.customer.name,
          phone: quotation.customer.phone,
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
      quantity: item.quantity,
      grossWeight: item.grossWeight ? Number(item.grossWeight) : null,
      netWeight: item.netWeight ? Number(item.netWeight) : null,
      stoneWeight: item.stoneWeight ? Number(item.stoneWeight) : null,
      caratWeight: item.caratWeight ? Number(item.caratWeight) : null,
      rate: item.rate ? Number(item.rate) : null,
      makingCharge: Number(item.makingCharge),
      makingChargeType: item.makingChargeType as ChargeType,
      stoneCharge: Number(item.stoneCharge),
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
    })),
  };
}

export type QuotationSortBy = "quotationDate" | "quotationNumber" | "totalAmount";

function buildQuotationsWhere(
  storeId: string,
  params: { search?: string; status?: string | "ALL" },
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
        : buildQuotationsWhere(storeId, { search: params.search, status: params.status }, scope);

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
      Date: new Date(quotation.quotationDate).toLocaleDateString("en-IN"),
      "Valid Until": quotation.validUntil
        ? new Date(quotation.validUntil).toLocaleDateString("en-IN")
        : "",
      Customer: quotation.customer?.name || "",
      Status: quotation.status,
      Subtotal: quotation.subtotal,
      "Making Charges": quotation.makingCharges,
      "Stone Charges": quotation.stoneCharges,
      Discount: quotation.discount,
      "Tax Amount": quotation.taxAmount,
      "Total Amount": quotation.totalAmount,
      "Converted To Invoice": quotation.convertedTo?.invoiceNumber || "",
    }));

    const { fileName, fileBase64 } = buildExcelExport(rows, "Quotations", "quotations");

    return {
      success: true,
      message: "Quotations exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    console.error("exportQuotationsToExcel error:", error);
    return { success: false, message: "Failed to export quotations." };
  }
}

export async function getQuotationById(id: string) {
  const storeId = await requireStoreScope();

  const quotation = await prisma.quotation.findFirst({
    where: { id, storeId },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      items: true,
      convertedTo: { select: { id: true, invoiceNumber: true } },
    },
  });

  if (!quotation) return null;
  return mapQuotation(quotation);
}

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
    where: { storeId, status: InventoryStockStatus.IN_STOCK, isActive: true },
    orderBy: { stockCode: "asc" },
    include: {
      product: { select: { name: true } },
      metalType: { select: { id: true, name: true } },
    },
  });

  return stockItems.map((stock) => ({
    id: stock.id,
    stockCode: stock.stockCode,
    productName: stock.product.name,
    metalType: stock.metalType,
    purity: stock.purity,
    netWeight: stock.netWeight ? Number(stock.netWeight) : null,
    saleRate: stock.saleRate ? Number(stock.saleRate) : null,
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
      return { success: false, message: "Please select a customer" };
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

    const discount = toNumber(formData.get("discount"));
    const taxAmount = toNumber(formData.get("taxAmount"));
    // Computed client-side by computeGst() (lib/gst.ts) — sgst+cgst on an
    // intra-state quote, igst alone on an inter-state one, never both. Kept
    // as three separate columns (mirroring Invoice/Purchase) even though
    // Quotation only ever needed a document-level total before.
    const sgstAmount = toNumber(formData.get("sgstAmount"));
    const cgstAmount = toNumber(formData.get("cgstAmount"));
    const igstAmount = toNumber(formData.get("igstAmount"));
    const quotationDateRaw = String(formData.get("quotationDate") || "");
    const validUntilRaw = String(formData.get("validUntil") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.rate) * lineQuantity(item),
      0,
    );
    const makingCharges = items.reduce((sum, item) => sum + toNumber(item.makingCharge), 0);
    const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
    const totalAmount = subtotal + makingCharges + stoneCharges - discount + taxAmount;

    const storeId = await requireStoreScope();

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

    if (locationId) {
      const location = await prisma.storeLocation.findFirst({
        where: { id: locationId, storeId },
        select: { id: true },
      });
      if (!location) {
        return { success: false, message: "Selected location is invalid" };
      }

      const scope = await getLocationScope();
      if (!isLocationAllowed(scope, locationId)) {
        return { success: false, message: "You don't have access to file a quotation against this location" };
      }
    }

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
        totalAmount,
        notes,
        locationId: locationId ?? undefined,
        items: {
          create: items.map((item) => ({
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
    console.error("createQuotation error:", error);
    return { success: false, message: "Failed to create quotation" };
  }
}

/** Only "open" quotations (never converted) can be deleted. */
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
    console.error("deleteQuotation error:", error);
    return { success: false, message: "Failed to delete quotation" };
  }
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
      include: { items: true },
    });

    if (!quotation) {
      return { success: false, message: "Quotation not found" };
    }

    if (quotation.convertedToId || quotation.status !== "open") {
      return { success: false, message: "This quotation has already been converted" };
    }

    const taxAmount = toNumber(formData.get("taxAmount"));
    const paidAmount = toNumber(formData.get("paidAmount"));
    const dueDateRaw = String(formData.get("dueDate") || "");
    const notes = String(formData.get("notes") || "").trim() || quotation.notes;

    // A Composition-scheme store is legally barred from charging any GST at
    // all — this form re-asks for a fresh tax amount rather than reusing
    // the quotation's own (see this function's doc comment), so it needs
    // its own guard rather than inheriting createQuotation's.
    const businessSettings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { gstScheme: true },
    });
    if (businessSettings?.gstScheme === "COMPOSITION" && taxAmount !== 0) {
      return {
        success: false,
        message: "This store is on the Composition Scheme and cannot charge GST on an invoice.",
      };
    }

    const subtotal = Number(quotation.subtotal);
    const makingCharges = Number(quotation.makingCharges);
    const stoneCharges = Number(quotation.stoneCharges);
    const discount = Number(quotation.discount);

    const totalAmount = subtotal + makingCharges + stoneCharges - discount + taxAmount;
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    let status: InvoiceStatus = InvoiceStatus.PAID;
    if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
    else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;

    const invoiceNumber = await generateInvoiceNumber(storeId);

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
          totalAmount,
          paidAmount,
          balanceAmount,
          notes,
          locationId: quotation.locationId ?? undefined,
          // Recorded the same way a direct invoice does, so a quotation-born
          // sale attributes to whoever converted it instead of falling into
          // the Sales-by-User report's "Not recorded" bucket.
          createdById: actor.id ?? null,
          createdByName: actor.name ?? actor.email ?? null,
          items: {
            create: quotation.items.map((item) => ({
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
              quantity: item.quantity,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
              stoneWeight: item.stoneWeight ?? undefined,
              caratWeight: item.caratWeight ?? undefined,
              rate: item.rate ?? undefined,
              makingCharge: item.makingCharge,
              makingChargeType: item.makingChargeType,
              stoneCharge: item.stoneCharge,
              lineTotal: item.lineTotal,
              inventoryStockId: item.inventoryStockId ?? undefined,
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

      if (balanceAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.SALE,
            customerId: quotation.customerId,
            invoiceId: created.id,
            amount: balanceAmount,
            description: `Invoice ${invoiceNumber} balance due (from Quotation ${quotation.quotationNumber})`,
            locationId: quotation.locationId ?? undefined,
          },
        });
      }

      await tx.quotation.update({
        where: { id: quotationId },
        data: { status: "converted", convertedToId: created.id },
      });

      return created;
    });

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
    console.error("convertQuotationToInvoice error:", error);
    return { success: false, message: "Failed to convert quotation to invoice" };
  }
}
