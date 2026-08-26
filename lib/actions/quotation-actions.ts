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
import { requireStoreScope } from "@/lib/store-context";
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

function lineTotal(item: QuotationLineItemInput) {
  const metalValue = toNumber(item.rate) * toNumber(item.netWeight);
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
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: {
      storeId,
      invoiceNumber: { startsWith: `INV-${year}-` },
    },
  });

  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
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
) {
  const search = String(params.search || "").trim();
  const status = params.status && params.status !== "ALL" ? params.status : undefined;

  return {
    storeId,
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
  const where = buildQuotationsWhere(storeId, params);

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
    const storeId = await requireStoreScope();
    const sortBy = toQuotationSortBy(params.sortBy);
    const sortOrder = params.sortOrder || "desc";

    const where =
      params.selectedIds && params.selectedIds.length > 0
        ? { id: { in: params.selectedIds }, storeId }
        : buildQuotationsWhere(storeId, { search: params.search, status: params.status });

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
    select: { id: true, name: true, phone: true, customerCode: true },
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
    const customerId = String(formData.get("customerId") || "");
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
    const quotationDateRaw = String(formData.get("quotationDate") || "");
    const validUntilRaw = String(formData.get("validUntil") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.rate) * toNumber(item.netWeight),
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
        totalAmount,
        notes,
        items: {
          create: items.map((item) => ({
            itemName: item.itemName,
            metalTypeId: item.metalTypeId ?? undefined,
            purity: item.purity ?? undefined,
            quantity: item.quantity || 1,
            grossWeight: item.grossWeight ?? undefined,
            netWeight: item.netWeight ?? undefined,
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
          items: {
            create: quotation.items.map((item) => ({
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
              quantity: item.quantity,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
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

        const { count } = await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId },
          data: { status: InventoryStockStatus.SOLD, saleAmount: item.lineTotal },
        });
        if (count === 0) continue;

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE,
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
