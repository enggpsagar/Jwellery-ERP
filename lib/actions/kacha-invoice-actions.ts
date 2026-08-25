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
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { sendMail } from "@/lib/mailer";
import { kachaSlipEmail } from "@/lib/email-templates";
import {
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions";
import { buildExcelExport } from "@/lib/excel-export";

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
              inventoryStockId: item.inventoryStockId || undefined,
            })),
          },
        },
      });

      for (const item of items) {
        if (!item.inventoryStockId) continue;

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

/** Email a formatted copy of this Kacha slip to the customer on file. */
export async function emailKachaInvoiceAction(
  kachaInvoiceId: string,
): Promise<KachaInvoiceFormState> {
  try {
    const storeId = await requireStoreScope();

    const [kachaInvoice, settings] = await Promise.all([
      prisma.kachaInvoice.findFirst({
        where: { id: kachaInvoiceId, storeId },
        include: {
          customer: { select: { name: true, email: true } },
          items: true,
        },
      }),
      prisma.businessSettings.findUnique({
        where: { storeId },
        select: { businessName: true },
      }),
    ]);

    if (!kachaInvoice) return { success: false, message: "Kacha slip not found" };

    if (!kachaInvoice.customer?.email) {
      return { success: false, message: "This customer has no email on file" };
    }

    const { subject, html } = kachaSlipEmail({
      storeName: settings?.businessName || "Your Store",
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
