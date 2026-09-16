// lib/actions/credit-note-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  InvoiceStatus,
  InventoryStockStatus,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context";
import { actionErrorMessage } from "@/lib/action-error";
import { getBusinessSettings } from "@/lib/actions/settings-actions";
import { getReturnEligibility, type ReturnEligibility } from "@/lib/return-window";
import { formatShortDate } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { parseDateRangeBoundary } from "@/lib/date-range";
import {
  buildExcelExport,
  buildCsvExportBase64,
  buildPdfExportBase64,
} from "@/lib/excel-export";

export type CreditNoteFormState = {
  success: boolean;
  message: string;
  creditNoteId?: string;
};

const initialState: CreditNoteFormState = { success: false, message: "" };

export type ReturnableInvoiceItem = {
  id: string;
  itemName: string;
  quantity: number;
  /** Original quantity minus whatever prior credit notes already covered. */
  returnableQuantity: number;
  rate: number | null;
  lineTotal: number;
  inventoryStockId: string | null;
};

export type CreditNoteItemView = {
  id: string;
  invoiceItemId: string;
  itemName: string;
  quantity: number;
  rate: number | null;
  lineTotal: number;
};

export type CreditNoteView = {
  id: string;
  creditNoteNumber: string;
  creditNoteDate: string;
  reason: string | null;
  notes: string | null;
  totalAmount: number;
  createdByName: string | null;
  locationName: string | null;
  invoice: { id: string; invoiceNumber: string; invoiceDate: string };
  customer: {
    id: string;
    name: string;
    phone: string | null;
    gstin: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  } | null;
  items: CreditNoteItemView[];
};

/**
 * `{prefix}-{YYYYMMDD}-{padded sequence}`, e.g. `CN-20260904-0001` — same
 * shape/reasoning as generateInvoiceNumber in invoice-actions.ts. A fixed
 * "CN" prefix, not a store-configurable one: unlike invoices, credit notes
 * don't need their own prefix/starting-number setting, one flat scheme is
 * enough.
 */
async function generateCreditNoteNumber(storeId: string) {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const prefixPart = `CN-${datePart}-`;
  const count = await prisma.creditNote.count({
    where: { storeId, creditNoteNumber: { startsWith: prefixPart } },
  });

  return `${prefixPart}${String(count + 1).padStart(4, "0")}`;
}

/**
 * Original quantity minus whatever prior credit notes already covered, per
 * InvoiceItem — computed live from CreditNoteItem rows rather than a
 * denormalized counter on InvoiceItem, so it can never drift out of sync
 * with the credit notes that are the actual source of truth.
 */
async function getReturnableQuantities(invoiceId: string): Promise<Map<string, number>> {
  const items = await prisma.invoiceItem.findMany({
    where: { invoiceId },
    select: { id: true, quantity: true },
  });

  const returned = await prisma.creditNoteItem.groupBy({
    by: ["invoiceItemId"],
    where: { invoiceItemId: { in: items.map((item) => item.id) } },
    _sum: { quantity: true },
  });
  const returnedMap = new Map(returned.map((row) => [row.invoiceItemId, row._sum.quantity ?? 0]));

  return new Map(items.map((item) => [item.id, item.quantity - (returnedMap.get(item.id) ?? 0)]));
}

/** This invoice's return-window status, from the store's current returnWindowDays setting. */
export async function getInvoiceReturnEligibility(invoiceDate: Date | string): Promise<ReturnEligibility> {
  const settings = await getBusinessSettings();
  const date = typeof invoiceDate === "string" ? new Date(invoiceDate) : invoiceDate;
  const eligibility = getReturnEligibility(date, settings.returnWindowDays);
  // Forced ineligible (not just 0 days) when the policy is switched off —
  // passing 0 straight into getReturnEligibility would still read eligible
  // on the invoice's own creation day (daysElapsed 0 <= 0 days).
  return settings.returnWindowEnabled ? eligibility : { ...eligibility, eligible: false };
}

/** Line items on this invoice that still have something left to return — feeds the Return Items dialog. */
export async function getReturnableInvoiceItems(invoiceId: string): Promise<ReturnableInvoiceItem[] | null> {
  const storeId = await getStoreIdForRead();
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, storeId },
    include: { items: true },
  });
  if (!invoice) return null;

  const returnable = await getReturnableQuantities(invoiceId);

  return invoice.items
    .map((item) => ({
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
      returnableQuantity: returnable.get(item.id) ?? 0,
      rate: item.rate ? Number(item.rate) : null,
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
    }))
    .filter((item) => item.returnableQuantity > 0);
}

function mapCreditNote(creditNote: any): CreditNoteView {
  return {
    id: creditNote.id,
    creditNoteNumber: creditNote.creditNoteNumber,
    creditNoteDate: creditNote.creditNoteDate.toISOString(),
    reason: creditNote.reason ?? null,
    notes: creditNote.notes ?? null,
    totalAmount: Number(creditNote.totalAmount),
    createdByName: creditNote.createdByName ?? creditNote.createdBy?.name ?? null,
    locationName: creditNote.location?.name ?? null,
    invoice: {
      id: creditNote.invoice.id,
      invoiceNumber: creditNote.invoice.invoiceNumber,
      invoiceDate: creditNote.invoice.invoiceDate.toISOString(),
    },
    customer: creditNote.customer
      ? {
          id: creditNote.customer.id,
          name: creditNote.customer.name,
          phone: creditNote.customer.phone,
          gstin: creditNote.customer.gstin ?? null,
          addressLine1: creditNote.customer.addressLine1 ?? null,
          addressLine2: creditNote.customer.addressLine2 ?? null,
          city: creditNote.customer.city ?? null,
          state: creditNote.customer.state ?? null,
          pincode: creditNote.customer.pincode ?? null,
        }
      : null,
    items: ((creditNote.items ?? []) as any[]).map((item) => ({
      id: item.id,
      invoiceItemId: item.invoiceItemId,
      itemName: item.itemName,
      quantity: item.quantity,
      rate: item.rate ? Number(item.rate) : null,
      lineTotal: Number(item.lineTotal),
    })),
  };
}

const CREDIT_NOTE_INCLUDE = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      gstin: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      pincode: true,
    },
  },
  invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true } },
  createdBy: { select: { name: true, email: true } },
  location: { select: { name: true } },
  items: true,
} as const;

export async function getCreditNoteById(id: string): Promise<CreditNoteView | null> {
  const storeId = await getStoreIdForRead();
  const creditNote = await prisma.creditNote.findFirst({
    where: { id, storeId },
    include: CREDIT_NOTE_INCLUDE,
  });
  if (!creditNote) return null;
  return mapCreditNote(creditNote);
}

/** Every credit note raised against one invoice — shown on the invoice detail page. */
export async function getCreditNotesForInvoice(invoiceId: string): Promise<CreditNoteView[]> {
  const storeId = await getStoreIdForRead();
  const creditNotes = await prisma.creditNote.findMany({
    where: { invoiceId, storeId },
    orderBy: { creditNoteDate: "desc" },
    include: CREDIT_NOTE_INCLUDE,
  });
  return creditNotes.map(mapCreditNote);
}

export type CreditNoteSortBy = "creditNoteDate" | "totalAmount" | "creditNoteNumber";
export type SortOrder = "asc" | "desc";

export type GetCreditNotesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: CreditNoteSortBy;
  sortOrder?: SortOrder;
  dateFrom?: string;
  dateTo?: string;
};

export type CreditNotesListResponse = {
  creditNotes: CreditNoteView[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

type ExportCreditNotesParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
  dateFrom?: string;
  dateTo?: string;
  format?: "csv" | "xlsx" | "pdf";
};

function getCreditNoteWhere(storeId: string, search?: string, dateFrom?: string, dateTo?: string) {
  const query = String(search || "").trim();
  const from = parseDateRangeBoundary(dateFrom, false);
  const to = parseDateRangeBoundary(dateTo, true);

  return {
    storeId,
    ...(from || to
      ? { creditNoteDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(query
      ? {
          OR: [
            { creditNoteNumber: { contains: query, mode: "insensitive" as const } },
            { customer: { name: { contains: query, mode: "insensitive" as const } } },
            { invoice: { invoiceNumber: { contains: query, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

function getCreditNoteOrderBy(sortBy: CreditNoteSortBy = "creditNoteDate", sortOrder: SortOrder = "desc") {
  if (sortBy === "totalAmount") return { totalAmount: sortOrder };
  if (sortBy === "creditNoteNumber") return { creditNoteNumber: sortOrder };
  return { creditNoteDate: sortOrder };
}

/** Paginated, filterable store-wide list — backs /billing/credit-notes. */
export async function getCreditNotes(params: GetCreditNotesParams = {}): Promise<CreditNotesListResponse> {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const sortBy = params.sortBy || "creditNoteDate";
  const sortOrder = params.sortOrder || "desc";

  const storeId = await requireStoreScope();
  const where = getCreditNoteWhere(storeId, params.search, params.dateFrom, params.dateTo);
  const orderBy = getCreditNoteOrderBy(sortBy, sortOrder);

  const [totalCount, creditNotes] = await Promise.all([
    prisma.creditNote.count({ where }),
    prisma.creditNote.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: CREDIT_NOTE_INCLUDE,
    }),
  ]);

  return {
    creditNotes: creditNotes.map(mapCreditNote),
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    },
  };
}

async function getAllCreditNotesForExport(params: ExportCreditNotesParams = {}): Promise<CreditNoteView[]> {
  const sortBy = (params.sortBy || "creditNoteDate") as CreditNoteSortBy;
  const sortOrder = params.sortOrder || "desc";

  const storeId = await requireStoreScope();
  const where = params.selectedIds?.length
    ? { id: { in: params.selectedIds }, storeId }
    : getCreditNoteWhere(storeId, params.search, params.dateFrom, params.dateTo);
  const orderBy = getCreditNoteOrderBy(sortBy, sortOrder);

  const creditNotes = await prisma.creditNote.findMany({ where, orderBy, include: CREDIT_NOTE_INCLUDE });
  return creditNotes.map(mapCreditNote);
}

export async function exportCreditNotesToExcel(params: ExportCreditNotesParams = {}): Promise<{
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
}> {
  try {
    const creditNotes = await getAllCreditNotesForExport(params);

    if (!creditNotes.length) {
      return { success: false, message: "No credit notes found to export." };
    }

    const rows = creditNotes.map((creditNote, index) => ({
      "Sr. No.": index + 1,
      "Credit Note #": creditNote.creditNoteNumber,
      Date: formatShortDate(creditNote.creditNoteDate),
      Party: creditNote.customer?.name || "",
      "Against Invoice": creditNote.invoice.invoiceNumber,
      "Amount Refunded": creditNote.totalAmount,
      Reason: creditNote.reason || "",
      "Created By": creditNote.createdByName || "",
      Location: creditNote.locationName || "",
    }));

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "credit-notes")
        : params.format === "pdf"
          ? buildPdfExportBase64(rows, "Credit Notes", "credit-notes")
          : buildExcelExport(rows, "Credit Notes", "credit-notes");

    return { success: true, message: "Credit notes exported successfully.", fileName, fileBase64 };
  } catch (error) {
    logger.error("exportCreditNotesToExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to export credit notes.") };
  }
}

export type CreditNoteLineInput = {
  invoiceItemId: string;
  quantity: number;
};

/**
 * Raises a Credit Note against a PAID/PARTIAL invoice, still within the
 * store's return window. Mirrors cancelInvoice's stock-restore/ledger
 * shape (lib/actions/invoice-actions.ts) but is deliberately its own
 * action, not a branch of it: cancelInvoice is whole-invoice and explicitly
 * excludes PAID invoices, whereas a return's entire point is the item was
 * already fully paid for and delivered.
 */
export async function createCreditNote(
  invoiceId: string,
  prevState: CreditNoteFormState = initialState,
  formData: FormData,
): Promise<CreditNoteFormState> {
  try {
    let actor;
    try {
      actor = await requirePermission(PERMISSIONS.BILLING_UPDATE);
    } catch {
      return { success: false, message: "You do not have permission to process returns." };
    }

    const storeId = await requireStoreScope();
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, storeId },
      include: { items: true },
    });
    if (!invoice) return { success: false, message: "Invoice not found" };

    if (invoice.status !== InvoiceStatus.PAID && invoice.status !== InvoiceStatus.PARTIAL) {
      return {
        success: false,
        message: "Only paid or partially-paid invoices can have items returned.",
      };
    }

    const settings = await getBusinessSettings();
    if (!settings.returnWindowEnabled) {
      return { success: false, message: "Returns are currently disabled for this store." };
    }
    const eligibility = getReturnEligibility(invoice.invoiceDate, settings.returnWindowDays);
    if (!eligibility.eligible) {
      return {
        success: false,
        message: `The ${settings.returnWindowDays}-day return window for this invoice expired on ${formatShortDate(eligibility.windowExpiresAt)}.`,
      };
    }

    let lines: CreditNoteLineInput[];
    try {
      lines = JSON.parse(String(formData.get("itemsJson") || "[]"));
    } catch {
      return { success: false, message: "Invalid return items" };
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return { success: false, message: "Select at least one item to return" };
    }

    const reason = String(formData.get("reason") || "").trim() || null;

    const returnable = await getReturnableQuantities(invoiceId);
    const itemsById = new Map(invoice.items.map((item) => [item.id, item]));

    let totalAmount = 0;
    const resolvedLines: { item: (typeof invoice.items)[number]; quantity: number; lineTotal: number }[] = [];

    for (const line of lines) {
      const item = itemsById.get(line.invoiceItemId);
      if (!item) {
        return { success: false, message: "One of the selected items no longer exists on this invoice." };
      }

      const quantity = Math.floor(Number(line.quantity));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return { success: false, message: `Enter a valid return quantity for ${item.itemName}.` };
      }

      const maxReturnable = returnable.get(item.id) ?? 0;
      if (quantity > maxReturnable) {
        return {
          success: false,
          message: `Cannot return ${quantity} of "${item.itemName}" — only ${maxReturnable} left to return.`,
        };
      }

      // Refund the same per-unit value the customer actually paid for this
      // line, not the rate alone — lineTotal already folds in making
      // charge/stone charge/GST/scheme discount per unit.
      const perUnit = item.quantity > 0 ? Number(item.lineTotal) / item.quantity : 0;
      const lineTotal = Number((perUnit * quantity).toFixed(2));
      totalAmount += lineTotal;

      resolvedLines.push({ item, quantity, lineTotal });
    }

    totalAmount = Number(totalAmount.toFixed(2));
    const creditNoteNumber = await generateCreditNoteNumber(storeId);

    const created = await prisma.$transaction(async (tx) => {
      const creditNote = await tx.creditNote.create({
        data: {
          storeId,
          creditNoteNumber,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          reason,
          totalAmount,
          locationId: invoice.locationId ?? undefined,
          createdById: actor.id ?? null,
          createdByName: actor.name ?? actor.email ?? null,
        },
      });

      for (const { item, quantity, lineTotal } of resolvedLines) {
        await tx.creditNoteItem.create({
          data: {
            creditNoteId: creditNote.id,
            invoiceItemId: item.id,
            inventoryStockId: item.inventoryStockId ?? undefined,
            itemName: item.itemName,
            quantity,
            rate: item.rate ?? undefined,
            lineTotal,
          },
        });

        if (item.inventoryStockId) {
          await tx.inventoryStock.updateMany({
            where: { id: item.inventoryStockId, storeId },
            data: { quantity: { increment: quantity } },
          });

          // Same principle as cancelInvoice's stock restore: trust the
          // post-write read, never a pre-write snapshot, when deciding
          // whether to flip status back to IN_STOCK.
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
              quantity,
              netWeight: item.netWeight ?? undefined,
              referenceType: "CreditNote",
              referenceId: creditNote.id,
              notes: `Returned via credit note ${creditNoteNumber}`,
            },
          });
        }
      }

      // The refund itself — a CREDIT on the customer's ledger, same shape
      // as invoice-actions.ts's other SALE-sourced entries, tagged
      // SALE_RETURN and linked to this credit note so it reads distinctly
      // from a payment collected or a cancellation write-off.
      await tx.ledgerEntry.create({
        data: {
          storeId,
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.SALE_RETURN,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          creditNoteId: creditNote.id,
          amount: totalAmount,
          description: `Credit note ${creditNoteNumber} — return against invoice ${invoice.invoiceNumber}`,
          locationId: invoice.locationId ?? undefined,
        },
      });

      // The invoice's own balanceAmount/status were previously left
      // completely untouched by a return — the ledger above correctly
      // reflected the customer owing less (or the store now owing them a
      // refund), but the invoice record itself (what Billing, Dashboard's
      // Outstanding Receivables, and the Payment In FIFO allocator all
      // actually read) kept showing the pre-return balance forever.
      // totalAmount itself is left alone — it's the original tax invoice's
      // legal billed amount, the CreditNote row is the audit trail for the
      // adjustment, same convention as every other document here. A
      // negative balanceAmount (returned value exceeds what was still
      // owed) means the store now owes the customer money back; every
      // "outstanding" aggregate in this app already only sums
      // balanceAmount > 0, so that correctly stops counting it as
      // receivable rather than needing a separate flag.
      const newBalance = Number(
        (Number(invoice.balanceAmount) - totalAmount).toFixed(2),
      );
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          balanceAmount: newBalance,
          status: newBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL,
        },
      });

      return creditNote;
    });

    revalidatePath("/billing");
    revalidatePath(`/billing/${invoiceId}`);
    revalidatePath("/billing/credit-notes");
    revalidatePath(`/billing/credit-notes/${created.id}`);
    revalidatePath("/customers");
    revalidatePath(`/customers/${invoice.customerId}`);
    revalidatePath("/inventory/stock");

    return {
      success: true,
      message: `Credit note ${creditNoteNumber} created`,
      creditNoteId: created.id,
    };
  } catch (error) {
    logger.error("createCreditNote error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to create credit note") };
  }
}
