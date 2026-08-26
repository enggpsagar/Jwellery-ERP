// lib/actions/kacha-invoice-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  InvoiceStatus,
  InventoryStockStatus,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
  PurityType,
  ChargeType,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { requireAuth, requireRole } from "@/lib/auth/auth";
import { sendMail } from "@/lib/mailer";
import { kachaSlipEmail, dataBackupEmail } from "@/lib/email-templates";
import { resolveStoreName } from "@/lib/invite-email";
import { APP_NAME } from "@/lib/constants/app";
import {
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions";
import {
  buildExcelExport,
  buildMultiSheetExcelExport,
  parseExcelUpload,
} from "@/lib/excel-export";

export type KachaInvoiceLineItemInput = {
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
  dmoWeight?: number | null;
  inventoryStockId?: string | null;
};

export type KachaInvoiceFormState = {
  success: boolean;
  message: string;
  kachaInvoiceId?: string;
  invoiceId?: string;
};

const initialState: KachaInvoiceFormState = { success: false, message: "" };

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

/** Never trust client input for the making-charge mode — anything other
 * than a valid ChargeType falls back to FIXED. */
function toChargeType(value: unknown): ChargeType {
  return value === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
}

function lineTotal(item: KachaInvoiceLineItemInput) {
  const metalValue = toNumber(item.rate) * toNumber(item.netWeight);
  return metalValue + toNumber(item.makingCharge) + toNumber(item.stoneCharge);
}

async function generateSlipNumber(storeId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.kachaInvoice.count({
    where: {
      storeId,
      slipNumber: { startsWith: `KACHA-${year}-` },
    },
  });

  return `KACHA-${year}-${String(count + 1).padStart(4, "0")}`;
}

function mapKachaInvoice(kachaInvoice: any) {
  return {
    id: kachaInvoice.id,
    slipNumber: kachaInvoice.slipNumber,
    invoiceDate: kachaInvoice.invoiceDate.toISOString(),
    status: kachaInvoice.status as InvoiceStatus,
    subtotal: Number(kachaInvoice.subtotal),
    makingCharges: Number(kachaInvoice.makingCharges),
    stoneCharges: Number(kachaInvoice.stoneCharges),
    discount: Number(kachaInvoice.discount),
    totalAmount: Number(kachaInvoice.totalAmount),
    paidAmount: Number(kachaInvoice.paidAmount),
    balanceAmount: Number(kachaInvoice.balanceAmount),
    notes: kachaInvoice.notes,
    convertedToId: kachaInvoice.convertedToId,
    convertedTo: kachaInvoice.convertedTo
      ? {
          id: kachaInvoice.convertedTo.id,
          invoiceNumber: kachaInvoice.convertedTo.invoiceNumber,
        }
      : null,
    customer: kachaInvoice.customer
      ? {
          id: kachaInvoice.customer.id,
          name: kachaInvoice.customer.name,
          phone: kachaInvoice.customer.phone,
          gstin: kachaInvoice.customer.gstin,
        }
      : null,
    items: (kachaInvoice.items ?? []).map((item: any) => ({
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
      dmoWeight: item.dmoWeight ? Number(item.dmoWeight) : null,
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
    })),
  };
}

export type KachaInvoiceSortField = "invoiceDate" | "slipNumber" | "totalAmount";

const KACHA_INVOICE_SORT_FIELDS: KachaInvoiceSortField[] = [
  "invoiceDate",
  "slipNumber",
  "totalAmount",
];

function isKachaInvoiceSortField(value: unknown): value is KachaInvoiceSortField {
  return KACHA_INVOICE_SORT_FIELDS.includes(value as KachaInvoiceSortField);
}

export type GetKachaInvoicesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: InvoiceStatus | "ALL" | string;
  sortBy?: KachaInvoiceSortField | string;
  sortOrder?: "asc" | "desc";
};

type KachaInvoiceQueryParams = {
  search?: string;
  status?: InvoiceStatus | "ALL" | string;
  sortBy?: KachaInvoiceSortField | string;
  sortOrder?: "asc" | "desc" | string;
  selectedIds?: string[];
};

/**
 * Shared where/orderBy builder for the Kacha slip list and the export
 * action, so the two never drift apart on what "the filtered set" means.
 */
function buildKachaInvoiceQuery(params: KachaInvoiceQueryParams, storeId: string) {
  const search = String(params.search || "").trim();
  const status =
    params.status && params.status !== "ALL" && params.status in InvoiceStatus
      ? (params.status as InvoiceStatus)
      : undefined;
  const sortBy = isKachaInvoiceSortField(params.sortBy) ? params.sortBy : "invoiceDate";
  const sortOrder = params.sortOrder === "asc" ? "asc" : "desc";
  const selectedIds = params.selectedIds?.filter(Boolean) ?? [];

  const where = {
    storeId,
    ...(selectedIds.length ? { id: { in: selectedIds } } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { slipNumber: { contains: search, mode: "insensitive" as const } },
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const orderBy = { [sortBy]: sortOrder } as const;

  return { where, orderBy };
}

export async function getKachaInvoices(params: GetKachaInvoicesParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));

  const storeId = await requireStoreScope();
  const { where, orderBy } = buildKachaInvoiceQuery(params, storeId);

  const [totalCount, kachaInvoices] = await Promise.all([
    prisma.kachaInvoice.count({ where }),
    prisma.kachaInvoice.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, phone: true, gstin: true } },
        convertedTo: { select: { id: true, invoiceNumber: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    kachaInvoices: kachaInvoices.map(mapKachaInvoice),
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

export type ExportKachaInvoicesParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: string;
};

export type ExportKachaInvoicesResult = {
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
};

/** Exports the same filtered/sorted set the Kacha Slips list is currently showing. */
export async function exportKachaInvoicesToExcel(
  params: ExportKachaInvoicesParams = {},
): Promise<ExportKachaInvoicesResult> {
  try {
    const storeId = await requireStoreScope();
    const { where, orderBy } = buildKachaInvoiceQuery(params, storeId);

    const kachaInvoices = await prisma.kachaInvoice.findMany({
      where,
      orderBy,
      include: {
        customer: { select: { id: true, name: true, phone: true, gstin: true } },
        convertedTo: { select: { id: true, invoiceNumber: true } },
      },
    });

    if (!kachaInvoices.length) {
      return { success: false, message: "No Kacha slips found to export." };
    }

    const rows = kachaInvoices.map(mapKachaInvoice).map((kachaInvoice, index) => ({
      "Sr. No.": index + 1,
      "Slip #": kachaInvoice.slipNumber,
      Date: new Date(kachaInvoice.invoiceDate).toLocaleDateString("en-IN"),
      Customer: kachaInvoice.customer?.name || "",
      Status: kachaInvoice.status,
      Subtotal: kachaInvoice.subtotal,
      "Making Charges": kachaInvoice.makingCharges,
      "Stone Charges": kachaInvoice.stoneCharges,
      Discount: kachaInvoice.discount,
      Total: kachaInvoice.totalAmount,
      Paid: kachaInvoice.paidAmount,
      Balance: kachaInvoice.balanceAmount,
      "Converted To Invoice #": kachaInvoice.convertedTo?.invoiceNumber || "",
    }));

    const { fileName, fileBase64 } = buildExcelExport(rows, "Kacha Slips", "kacha-slips");

    return {
      success: true,
      message: "Kacha slips exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    console.error("exportKachaInvoicesToExcel error:", error);
    return { success: false, message: "Failed to export Kacha slips." };
  }
}

export async function getKachaInvoiceById(id: string) {
  const storeId = await requireStoreScope();

  const kachaInvoice = await prisma.kachaInvoice.findFirst({
    where: { id, storeId },
    include: {
      customer: { select: { id: true, name: true, phone: true, gstin: true } },
      items: true,
      convertedTo: { select: { id: true, invoiceNumber: true } },
    },
  });

  if (!kachaInvoice) return null;
  return mapKachaInvoice(kachaInvoice);
}

/** Same customer/stock pools as the Pakka invoice form — no need to duplicate the queries. */
export const getKachaInvoiceFormCustomers = getInvoiceFormCustomers;
export const getKachaInvoiceFormStockItems = getInvoiceFormStockItems;

/**
 * Create a Kacha slip with its line items in one transaction. Same
 * stock/ledger side-effects as createInvoice, minus any tax handling —
 * a Kacha slip is a real sale, just without GST paperwork yet.
 */
export async function createKachaInvoice(
  prevState: KachaInvoiceFormState = initialState,
  formData: FormData,
): Promise<KachaInvoiceFormState> {
  try {
    const customerId = String(formData.get("customerId") || "");
    const itemsRaw = String(formData.get("itemsJson") || "[]");

    if (!customerId) {
      return { success: false, message: "Please select a customer" };
    }

    let items: KachaInvoiceLineItemInput[] = [];
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
    const paidAmount = toNumber(formData.get("paidAmount"));
    const invoiceDateRaw = String(formData.get("invoiceDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.rate) * toNumber(item.netWeight),
      0,
    );
    const makingCharges = items.reduce((sum, item) => sum + toNumber(item.makingCharge), 0);
    const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
    const totalAmount = subtotal + makingCharges + stoneCharges - discount;
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    let status: InvoiceStatus = InvoiceStatus.PAID;
    if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
    else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;

    const storeId = await requireStoreScope();

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true },
    });
    if (!customer) {
      return { success: false, message: "Please select a customer" };
    }

    // Every referenced stock item must belong to this store — otherwise a
    // crafted itemsJson could link a line item to another store's stock,
    // leaking its details (and, via the SOLD-status update below, its
    // invoice/customer info) into this slip.
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

    const slipNumber = await generateSlipNumber(storeId);

    const kachaInvoice = await prisma.$transaction(async (tx) => {
      const created = await tx.kachaInvoice.create({
        data: {
          storeId,
          slipNumber,
          customerId,
          invoiceDate: invoiceDateRaw ? new Date(invoiceDateRaw) : new Date(),
          status,
          subtotal,
          makingCharges,
          stoneCharges,
          discount,
          totalAmount,
          paidAmount,
          balanceAmount,
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
              dmoWeight: item.dmoWeight ?? undefined,
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

        const { count } = await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId },
          data: { status: InventoryStockStatus.SOLD, saleAmount: lineTotal(item) },
        });
        if (count === 0) continue;

        await tx.inventoryTransaction.create({
          data: {
            inventoryStockId: item.inventoryStockId,
            transactionType: InventoryTransactionType.SALE,
            netWeight: item.netWeight ?? undefined,
            referenceType: "KachaInvoice",
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
            amount: balanceAmount,
            description: `Kacha slip ${slipNumber} balance due`,
          },
        });
      }

      return created;
    });

    revalidatePath("/billing/kacha");

    return {
      success: true,
      message: `Kacha slip ${slipNumber} created`,
      kachaInvoiceId: kachaInvoice.id,
    };
  } catch (error) {
    console.error("createKachaInvoice error:", error);
    return { success: false, message: "Failed to create Kacha slip" };
  }
}

/**
 * Record a payment against a Kacha slip's outstanding balance. Mirrors
 * recordInvoicePayment.
 */
export async function recordKachaInvoicePayment(
  kachaInvoiceId: string,
  prevState: KachaInvoiceFormState = initialState,
  formData: FormData,
): Promise<KachaInvoiceFormState> {
  try {
    const amount = toNumber(formData.get("amount"));
    const notes = String(formData.get("notes") || "").trim() || null;

    if (amount <= 0) {
      return { success: false, message: "Enter a valid payment amount" };
    }

    const storeId = await requireStoreScope();

    const kachaInvoice = await prisma.kachaInvoice.findFirst({
      where: { id: kachaInvoiceId, storeId },
    });
    if (!kachaInvoice) return { success: false, message: "Kacha slip not found" };

    const newPaid = Number(kachaInvoice.paidAmount) + amount;
    const newBalance = Math.max(0, Number(kachaInvoice.totalAmount) - newPaid);
    const status: InvoiceStatus =
      newBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

    await prisma.$transaction([
      prisma.kachaInvoice.updateMany({
        where: { id: kachaInvoiceId, storeId },
        data: { paidAmount: newPaid, balanceAmount: newBalance, status },
      }),
      prisma.ledgerEntry.create({
        data: {
          storeId,
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.SALE,
          customerId: kachaInvoice.customerId,
          amount,
          description: notes ?? `Payment received for ${kachaInvoice.slipNumber}`,
        },
      }),
    ]);

    revalidatePath("/billing/kacha");
    revalidatePath(`/billing/kacha/${kachaInvoiceId}`);

    return { success: true, message: "Payment recorded" };
  } catch (error) {
    console.error("recordKachaInvoicePayment error:", error);
    return { success: false, message: "Failed to record payment" };
  }
}

/**
 * Convert a Kacha slip into a formal Pakka (GST) invoice. Copies the
 * customer/items/weights/charges across, applies tax fields supplied on
 * this form, and links the two records both ways. Does not re-trigger
 * stock SOLD transitions or a second sale-debit ledger entry — the stock
 * was already sold and the ledger already reflects the amount owed at
 * Kacha creation; this is a paperwork upgrade, not a second sale.
 */
export async function convertKachaToPakka(
  kachaInvoiceId: string,
  prevState: KachaInvoiceFormState = initialState,
  formData: FormData,
): Promise<KachaInvoiceFormState> {
  try {
    const storeId = await requireStoreScope();

    const kachaInvoice = await prisma.kachaInvoice.findFirst({
      where: { id: kachaInvoiceId, storeId },
      include: { items: true },
    });

    if (!kachaInvoice) {
      return { success: false, message: "Kacha slip not found" };
    }

    if (kachaInvoice.convertedToId) {
      return { success: false, message: "This Kacha slip has already been converted" };
    }

    const taxAmount = toNumber(formData.get("taxAmount"));
    const dueDateRaw = String(formData.get("dueDate") || "");
    const notes = String(formData.get("notes") || "").trim() || kachaInvoice.notes;

    const subtotal = Number(kachaInvoice.subtotal);
    const makingCharges = Number(kachaInvoice.makingCharges);
    const stoneCharges = Number(kachaInvoice.stoneCharges);
    const discount = Number(kachaInvoice.discount);
    const paidAmount = Number(kachaInvoice.paidAmount);

    const totalAmount = subtotal + makingCharges + stoneCharges - discount + taxAmount;
    const balanceAmount = Math.max(0, totalAmount - paidAmount);

    let status: InvoiceStatus = InvoiceStatus.PAID;
    if (balanceAmount > 0 && paidAmount > 0) status = InvoiceStatus.PARTIAL;
    else if (balanceAmount > 0 && paidAmount === 0) status = InvoiceStatus.DRAFT;

    const year = new Date().getFullYear();
    const count = await prisma.invoice.count({
      where: { storeId, invoiceNumber: { startsWith: `INV-${year}-` } },
    });
    const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, "0")}`;

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          storeId,
          invoiceNumber,
          customerId: kachaInvoice.customerId,
          invoiceDate: kachaInvoice.invoiceDate,
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
            create: kachaInvoice.items.map((item) => ({
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
              dmoWeight: item.dmoWeight ?? undefined,
              lineTotal: item.lineTotal,
              inventoryStockId: item.inventoryStockId ?? undefined,
            })),
          },
        },
      });

      await tx.kachaInvoice.updateMany({
        where: { id: kachaInvoiceId, storeId },
        data: { convertedToId: created.id },
      });

      return created;
    });

    revalidatePath("/billing");
    revalidatePath("/billing/kacha");
    revalidatePath(`/billing/kacha/${kachaInvoiceId}`);
    revalidatePath(`/billing/${invoice.id}`);

    return {
      success: true,
      message: `Converted to Pakka invoice ${invoiceNumber}`,
      invoiceId: invoice.id,
    };
  } catch (error) {
    console.error("convertKachaToPakka error:", error);
    return { success: false, message: "Failed to convert to Pakka invoice" };
  }
}

/** Only DRAFT Kacha slips with no recorded payments and not yet converted can be deleted. */
export async function deleteKachaInvoice(id: string): Promise<KachaInvoiceFormState> {
  try {
    const storeId = await requireStoreScope();

    const kachaInvoice = await prisma.kachaInvoice.findFirst({ where: { id, storeId } });

    if (!kachaInvoice) return { success: false, message: "Kacha slip not found" };

    if (kachaInvoice.convertedToId) {
      return { success: false, message: "Cannot delete a Kacha slip that has been converted" };
    }

    if (kachaInvoice.status !== InvoiceStatus.DRAFT || Number(kachaInvoice.paidAmount) > 0) {
      return {
        success: false,
        message: "Only draft Kacha slips with no payments can be deleted",
      };
    }

    const { count } = await prisma.kachaInvoice.deleteMany({ where: { id, storeId } });
    if (count === 0) return { success: false, message: "Kacha slip not found" };

    revalidatePath("/billing/kacha");

    return { success: true, message: "Kacha slip deleted" };
  } catch (error) {
    console.error("deleteKachaInvoice error:", error);
    return { success: false, message: "Failed to delete Kacha slip" };
  }
}

/**
 * Column headers the importer reads. Also the template's header row.
 *
 * Deliberately NOT exported: a "use server" module may only export async
 * functions, and exporting this array would break the Next build even
 * though `tsc` is perfectly happy with it.
 */
const KACHA_IMPORT_COLUMNS = [
  "Slip Ref",
  "Customer Phone",
  "Customer Name",
  "Date",
  "Item Name",
  "Metal",
  "Purity",
  "Quantity",
  "Gross Weight",
  "Net Weight",
  "Rate",
  "Making Charge",
  "Making Charge Type",
  "Stone Charge",
  "Discount",
  "Paid Amount",
  "Notes",
] as const;

export type KachaImportResult = {
  success: boolean;
  message: string;
  createdCount?: number;
  /** Row-level problems. Populated only when nothing was created. */
  errors?: string[];
};

/**
 * A downloadable .xlsx showing the expected columns and one filled-in
 * example row, so nobody has to guess the header spelling.
 */
export async function getKachaImportTemplate(): Promise<{
  fileName: string;
  fileBase64: string;
}> {
  await requireStoreScope();

  const example = {
    "Slip Ref": "A1",
    "Customer Phone": "9876543210",
    "Customer Name": "Walk-in customer",
    Date: new Date().toLocaleDateString("en-IN"),
    "Item Name": "Gold Chain 22K",
    Metal: "Gold",
    Purity: "K22",
    Quantity: 1,
    "Gross Weight": 10.5,
    "Net Weight": 10.2,
    Rate: 6200,
    "Making Charge": 1500,
    "Making Charge Type": "FIXED",
    "Stone Charge": 0,
    Discount: 0,
    "Paid Amount": 0,
    Notes: "Rows sharing a Slip Ref become one slip",
  };

  return buildMultiSheetExcelExport(
    [{ name: "Kacha Slips", rows: [example], columns: [...KACHA_IMPORT_COLUMNS] }],
    "kacha-import-template",
  );
}

function cell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

/**
 * Bulk-creates Kacha slips from an uploaded spreadsheet.
 *
 * One row is one line item; rows sharing a **Slip Ref** are collapsed into a
 * single slip, which is what makes multi-item slips expressible in a flat
 * sheet. Slip-level values (customer, date, discount, paid, notes) are taken
 * from the first row of each group.
 *
 * Validation is all-or-nothing on purpose: the whole file is checked before
 * anything is written, and a single bad row rejects the import. A partial
 * import would leave the operator having to work out which half of their
 * spreadsheet made it in.
 *
 * Slips are created sequentially rather than in one transaction because
 * `generateSlipNumber()` derives the next number from a COUNT of committed
 * rows — inside a single transaction every slip would read the same count
 * and collide on the `@@unique([storeId, slipNumber])` constraint.
 */
export async function importKachaInvoicesFromExcel(
  formData: FormData,
): Promise<KachaImportResult> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STAFF]);
  } catch {
    return { success: false, message: "You do not have access to import Kacha slips." };
  }

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

    // Group rows into slips. A blank Slip Ref means "this row is its own
    // slip" — otherwise every unreferenced row would merge into one.
    const groups = new Map<string, { row: Record<string, unknown>; line: number }[]>();

    rows.forEach((row, index) => {
      const ref = cell(row, "Slip Ref") || `__row_${index}`;
      const existing = groups.get(ref);
      // +2 = one for the header row, one for 1-based spreadsheet numbering.
      const entry = { row, line: index + 2 };
      if (existing) existing.push(entry);
      else groups.set(ref, [entry]);
    });

    const [customers, metals] = await Promise.all([
      prisma.customer.findMany({
        where: { storeId },
        select: { id: true, name: true, phone: true },
      }),
      prisma.storeMetal.findMany({ where: { storeId }, select: { id: true, name: true } }),
    ]);

    const byPhone = new Map(
      customers.filter((c) => c.phone).map((c) => [c.phone!.trim(), c.id]),
    );
    const byName = new Map(customers.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const metalByName = new Map(metals.map((m) => [m.name.trim().toLowerCase(), m.id]));

    const errors: string[] = [];
    const parsed: {
      customerId: string;
      invoiceDate: Date;
      discount: number;
      paidAmount: number;
      notes: string | null;
      items: KachaInvoiceLineItemInput[];
    }[] = [];

    for (const [ref, entries] of groups) {
      const head = entries[0];
      const label = cell(head.row, "Slip Ref")
        ? `Slip Ref "${ref}"`
        : `Row ${head.line}`;

      const phone = cell(head.row, "Customer Phone");
      const name = cell(head.row, "Customer Name");
      const customerId =
        (phone && byPhone.get(phone)) || (name && byName.get(name.toLowerCase()));

      if (!customerId) {
        errors.push(
          `${label}: no customer matches phone "${phone}" or name "${name}". Add the customer first.`,
        );
        continue;
      }

      const dateRaw = cell(head.row, "Date");
      const invoiceDate = dateRaw ? new Date(dateRaw) : new Date();

      if (dateRaw && Number.isNaN(invoiceDate.getTime())) {
        errors.push(`${label}: "${dateRaw}" is not a valid date.`);
        continue;
      }

      const items: KachaInvoiceLineItemInput[] = [];

      for (const { row, line } of entries) {
        const itemName = cell(row, "Item Name");

        if (!itemName) {
          errors.push(`Row ${line}: Item Name is required.`);
          continue;
        }

        const metalName = cell(row, "Metal");
        const metalTypeId = metalName
          ? metalByName.get(metalName.toLowerCase())
          : undefined;

        if (metalName && !metalTypeId) {
          errors.push(
            `Row ${line}: metal "${metalName}" is not configured for this store (Settings → Taxonomy).`,
          );
          continue;
        }

        const purityRaw = cell(row, "Purity").toUpperCase();
        const purity =
          purityRaw && purityRaw in PurityType
            ? (purityRaw as PurityType)
            : null;

        if (purityRaw && !purity) {
          errors.push(`Row ${line}: "${purityRaw}" is not a valid purity.`);
          continue;
        }

        items.push({
          itemName,
          metalTypeId: metalTypeId ?? null,
          purity,
          quantity: Math.max(1, Math.trunc(toNumber(cell(row, "Quantity"), 1))),
          grossWeight: cell(row, "Gross Weight") ? toNumber(cell(row, "Gross Weight")) : null,
          netWeight: cell(row, "Net Weight") ? toNumber(cell(row, "Net Weight")) : null,
          rate: cell(row, "Rate") ? toNumber(cell(row, "Rate")) : null,
          makingCharge: toNumber(cell(row, "Making Charge")),
          makingChargeType: toChargeType(cell(row, "Making Charge Type").toUpperCase()),
          stoneCharge: toNumber(cell(row, "Stone Charge")),
        });
      }

      if (!items.length) {
        errors.push(`${label}: no valid line items.`);
        continue;
      }

      parsed.push({
        customerId,
        invoiceDate,
        discount: toNumber(cell(head.row, "Discount")),
        paidAmount: toNumber(cell(head.row, "Paid Amount")),
        notes: cell(head.row, "Notes") || null,
        items,
      });
    }

    if (errors.length) {
      return {
        success: false,
        message: `Import cancelled — ${errors.length} problem${errors.length === 1 ? "" : "s"} found. Nothing was created.`,
        errors: errors.slice(0, 50),
      };
    }

    let createdCount = 0;

    for (const slip of parsed) {
      const subtotal = slip.items.reduce(
        (sum, item) => sum + toNumber(item.rate) * toNumber(item.netWeight),
        0,
      );
      const makingCharges = slip.items.reduce(
        (sum, item) => sum + toNumber(item.makingCharge),
        0,
      );
      const stoneCharges = slip.items.reduce(
        (sum, item) => sum + toNumber(item.stoneCharge),
        0,
      );
      const totalAmount = subtotal + makingCharges + stoneCharges - slip.discount;
      const balanceAmount = Math.max(0, totalAmount - slip.paidAmount);

      let status: InvoiceStatus = InvoiceStatus.PAID;
      if (balanceAmount > 0 && slip.paidAmount > 0) status = InvoiceStatus.PARTIAL;
      else if (balanceAmount > 0 && slip.paidAmount === 0) status = InvoiceStatus.DRAFT;

      const slipNumber = await generateSlipNumber(storeId);

      await prisma.kachaInvoice.create({
        data: {
          storeId,
          slipNumber,
          customerId: slip.customerId,
          invoiceDate: slip.invoiceDate,
          status,
          subtotal,
          makingCharges,
          stoneCharges,
          discount: slip.discount,
          totalAmount,
          paidAmount: slip.paidAmount,
          balanceAmount,
          notes: slip.notes,
          items: {
            create: slip.items.map((item) => ({
              itemName: item.itemName,
              metalTypeId: item.metalTypeId ?? undefined,
              purity: item.purity ?? undefined,
              quantity: item.quantity,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
              rate: item.rate ?? undefined,
              makingCharge: item.makingCharge,
              makingChargeType: toChargeType(item.makingChargeType),
              stoneCharge: item.stoneCharge,
              lineTotal: lineTotal(item),
            })),
          },
        },
      });

      createdCount += 1;
    }

    revalidatePath("/billing/kacha");

    return {
      success: true,
      createdCount,
      message: `Imported ${createdCount} Kacha slip${createdCount === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    console.error("importKachaInvoicesFromExcel error:", error);
    return { success: false, message: "Failed to import Kacha slips." };
  }
}

export type DeleteAllKachaResult = {
  success: boolean;
  message: string;
  deletedCount?: number;
  backupSentTo?: string;
};

/** Counts shown in the confirmation dialog so the click is an informed one. */
export async function getKachaDeleteAllSummary(): Promise<{
  total: number;
  converted: number;
  withPayments: number;
  backupEmail: string | null;
}> {
  const storeId = await requireStoreScope();

  const [total, converted, withPayments, settings] = await Promise.all([
    prisma.kachaInvoice.count({ where: { storeId } }),
    prisma.kachaInvoice.count({ where: { storeId, convertedToId: { not: null } } }),
    prisma.kachaInvoice.count({ where: { storeId, paidAmount: { gt: 0 } } }),
    prisma.businessSettings.findUnique({
      where: { storeId },
      select: { backupEmail: true },
    }),
  ]);

  return {
    total,
    converted,
    withPayments,
    backupEmail: settings?.backupEmail?.trim() || null,
  };
}

/**
 * Deletes every Kacha slip in the store — but only ever after a complete
 * backup has actually landed in the configured backup inbox.
 *
 * The ordering here is the whole feature, so it is deliberate and must not
 * be rearranged: read the records, build the workbook, send it, and treat a
 * failed send as a hard stop. `sendMail` never throws (it reports
 * `{ sent: false }` for a missing SMTP config as well as a send failure),
 * so the `sent` flag has to be checked explicitly — an unchecked call would
 * silently delete everything on a server with no SMTP configured at all.
 *
 * The delete is scoped to the exact ids that went into the backup rather
 * than to `{ storeId }`, so a slip created by someone else between the read
 * and the delete is not destroyed without a copy of it existing.
 *
 * Unlike `deleteKachaInvoice` (single-slip), this deliberately does NOT
 * spare converted or paid slips — "delete all" means all, and the emailed
 * backup is what makes that recoverable. The confirmation dialog surfaces
 * those counts via `getKachaDeleteAllSummary()` first.
 */
export async function deleteAllKachaInvoices(): Promise<DeleteAllKachaResult> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  } catch {
    return {
      success: false,
      message: "Only the Store Owner can delete all Kacha slips.",
    };
  }

  try {
    const storeId = await requireStoreScope();
    const user = await requireAuth();

    const settings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { backupEmail: true },
    });

    const backupEmail = settings?.backupEmail?.trim();

    if (!backupEmail) {
      return {
        success: false,
        message:
          "No backup email is configured. Add one in Settings → Backup email before deleting all Kacha slips.",
      };
    }

    const kachaInvoices = await prisma.kachaInvoice.findMany({
      where: { storeId },
      orderBy: { invoiceDate: "desc" },
      include: {
        customer: { select: { name: true, phone: true, gstin: true } },
        convertedTo: { select: { invoiceNumber: true } },
        items: { include: { metalType: { select: { name: true } } } },
      },
    });

    if (!kachaInvoices.length) {
      return { success: false, message: "There are no Kacha slips to delete." };
    }

    const slipRows = kachaInvoices.map((kachaInvoice, index) => ({
      "Sr. No.": index + 1,
      "Slip #": kachaInvoice.slipNumber,
      Date: new Date(kachaInvoice.invoiceDate).toLocaleDateString("en-IN"),
      Customer: kachaInvoice.customer?.name || "",
      "Customer Phone": kachaInvoice.customer?.phone || "",
      "Customer GSTIN": kachaInvoice.customer?.gstin || "",
      Status: kachaInvoice.status,
      Subtotal: Number(kachaInvoice.subtotal),
      "Making Charges": Number(kachaInvoice.makingCharges),
      "Stone Charges": Number(kachaInvoice.stoneCharges),
      Discount: Number(kachaInvoice.discount),
      Total: Number(kachaInvoice.totalAmount),
      Paid: Number(kachaInvoice.paidAmount),
      Balance: Number(kachaInvoice.balanceAmount),
      "Converted To Invoice": kachaInvoice.convertedTo?.invoiceNumber || "",
      Notes: kachaInvoice.notes || "",
    }));

    // Line items live on their own sheet keyed by slip number — a single
    // flat sheet would drop them, and a backup that cannot rebuild the
    // slips it replaced is not a backup.
    const itemRows = kachaInvoices.flatMap((kachaInvoice) =>
      kachaInvoice.items.map((item) => ({
        "Slip #": kachaInvoice.slipNumber,
        Item: item.itemName,
        Metal: item.metalType?.name || "",
        Purity: item.purity || "",
        Quantity: item.quantity,
        "Gross Weight": item.grossWeight ? Number(item.grossWeight) : "",
        "Net Weight": item.netWeight ? Number(item.netWeight) : "",
        "DMO Weight": item.dmoWeight ? Number(item.dmoWeight) : "",
        Rate: item.rate ? Number(item.rate) : "",
        "Making Charge": Number(item.makingCharge),
        "Making Charge Type": item.makingChargeType,
        "Stone Charge": Number(item.stoneCharge),
        "Line Total": Number(item.lineTotal),
      })),
    );

    const { fileName, fileBase64 } = buildMultiSheetExcelExport(
      [
        { name: "Kacha Slips", rows: slipRows },
        { name: "Kacha Slip Items", rows: itemRows, columns: ["Slip #", "Item"] },
      ],
      "kacha-slips-backup",
    );

    const storeName = await resolveStoreName(storeId);

    const { subject, html, text } = dataBackupEmail({
      storeName,
      appName: APP_NAME,
      recordLabel: "Kacha slips",
      recordCount: kachaInvoices.length,
      fileName,
      triggeredBy: user.name || user.email || "Unknown user",
    });

    const result = await sendMail({
      to: backupEmail,
      subject,
      html,
      text,
      attachments: [
        {
          filename: fileName,
          contentBase64: fileBase64,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    // Hard stop: nothing is deleted unless the backup actually went out.
    if (!result.sent) {
      return {
        success: false,
        message: `Backup email could not be sent (${result.message}). No Kacha slips were deleted.`,
      };
    }

    const { count } = await prisma.kachaInvoice.deleteMany({
      where: { storeId, id: { in: kachaInvoices.map((k) => k.id) } },
    });

    revalidatePath("/billing/kacha");

    return {
      success: true,
      deletedCount: count,
      backupSentTo: backupEmail,
      message: `Backup of ${kachaInvoices.length} Kacha slips sent to ${backupEmail}. ${count} slips deleted.`,
    };
  } catch (error) {
    console.error("deleteAllKachaInvoices error:", error);
    return {
      success: false,
      message: "Failed to delete Kacha slips. No slips were deleted.",
    };
  }
}

/** Email a formatted copy of this Kacha slip to the customer on file. */
export async function emailKachaInvoiceAction(
  kachaInvoiceId: string,
): Promise<KachaInvoiceFormState> {
  try {
    const storeId = await requireStoreScope();

    const [kachaInvoice, storeName] = await Promise.all([
      prisma.kachaInvoice.findFirst({
        where: { id: kachaInvoiceId, storeId },
        include: {
          customer: { select: { name: true, email: true } },
          items: true,
        },
      }),
      resolveStoreName(storeId),
    ]);

    if (!kachaInvoice) return { success: false, message: "Kacha slip not found" };

    if (!kachaInvoice.customer?.email) {
      return { success: false, message: "This customer has no email on file" };
    }

    const { subject, html } = kachaSlipEmail({
      storeName,
      slipNumber: kachaInvoice.slipNumber,
      invoiceDate: kachaInvoice.invoiceDate.toISOString(),
      customerName: kachaInvoice.customer.name,
      items: kachaInvoice.items.map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        netWeight: item.netWeight ? Number(item.netWeight) : null,
        rate: item.rate ? Number(item.rate) : null,
        makingCharge: Number(item.makingCharge),
        stoneCharge: Number(item.stoneCharge),
        lineTotal: Number(item.lineTotal),
      })),
      subtotal: Number(kachaInvoice.subtotal),
      makingCharges: Number(kachaInvoice.makingCharges),
      stoneCharges: Number(kachaInvoice.stoneCharges),
      discount: Number(kachaInvoice.discount),
      totalAmount: Number(kachaInvoice.totalAmount),
      paidAmount: Number(kachaInvoice.paidAmount),
      balanceAmount: Number(kachaInvoice.balanceAmount),
    });

    const result = await sendMail({ to: kachaInvoice.customer.email, subject, html });

    return { success: result.sent, message: result.message };
  } catch (error) {
    console.error("emailKachaInvoiceAction error:", error);
    return { success: false, message: "Failed to email Kacha slip" };
  }
}
