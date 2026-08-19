// lib/actions/invoice-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  InvoiceStatus,
  InventoryStockStatus,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
  MetalType,
  PurityType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";

export type InvoiceLineItemInput = {
  itemName: string;
  metalType?: MetalType | null;
  purity?: PurityType | null;
  quantity: number;
  grossWeight?: number | null;
  netWeight?: number | null;
  rate?: number | null;
  makingCharge: number;
  stoneCharge: number;
  inventoryStockId?: string | null;
};

export type InvoiceFormState = {
  success: boolean;
  message: string;
  invoiceId?: string;
};

const initialState: InvoiceFormState = { success: false, message: "" };

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function lineTotal(item: InvoiceLineItemInput) {
  const metalValue = toNumber(item.rate) * toNumber(item.netWeight);
  return metalValue + toNumber(item.makingCharge) + toNumber(item.stoneCharge);
}

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
    customer: invoice.customer
      ? {
          id: invoice.customer.id,
          name: invoice.customer.name,
          phone: invoice.customer.phone,
        }
      : null,
    items: (invoice.items ?? []).map((item: any) => ({
      id: item.id,
      itemName: item.itemName,
      metalType: item.metalType,
      purity: item.purity,
      quantity: item.quantity,
      grossWeight: item.grossWeight ? Number(item.grossWeight) : null,
      netWeight: item.netWeight ? Number(item.netWeight) : null,
      rate: item.rate ? Number(item.rate) : null,
      makingCharge: Number(item.makingCharge),
      stoneCharge: Number(item.stoneCharge),
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
    })),
    convertedFromKacha: invoice.convertedFromKacha
      ? {
          id: invoice.convertedFromKacha.id,
          slipNumber: invoice.convertedFromKacha.slipNumber,
        }
      : null,
  };
}

export type GetInvoicesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: InvoiceStatus | "ALL";
};

export async function getInvoices(params: GetInvoicesParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const search = String(params.search || "").trim();
  const status = params.status && params.status !== "ALL" ? params.status : undefined;

  const storeId = await requireStoreScope();
  const where = {
    storeId,
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

  const [totalCount, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { invoiceDate: "desc" },
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

export async function getInvoiceById(id: string) {
  const storeId = await requireStoreScope();

  const invoice = await prisma.invoice.findFirst({
    where: { id, storeId },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      items: true,
      ledgerEntries: { orderBy: { entryDate: "desc" } },
      convertedFromKacha: { select: { id: true, slipNumber: true } },
    },
  });

  if (!invoice) return null;
  return mapInvoice(invoice);
}

/** Lightweight customer list for the invoice form's customer picker. */
export async function getInvoiceFormCustomers() {
  const storeId = await requireStoreScope();

  const customers = await prisma.customer.findMany({
    where: { storeId, isActive: true, isArchived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true, customerCode: true },
  });

  return customers;
}

/** In-stock items available to attach to an invoice line item. */
export async function getInvoiceFormStockItems() {
  const storeId = await requireStoreScope();

  const stockItems = await prisma.inventoryStock.findMany({
    where: { storeId, status: InventoryStockStatus.IN_STOCK, isActive: true },
    orderBy: { stockCode: "asc" },
    include: { product: { select: { name: true } } },
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
 * Create an invoice with its line items in one transaction. Any line item
 * linked to an InventoryStock row gets marked SOLD and a SALE transaction
 * is logged against it. If the invoice isn't fully paid up front, a DEBIT
 * ledger entry is recorded against the customer for the outstanding amount.
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

    const discount = toNumber(formData.get("discount"));
    const taxAmount = toNumber(formData.get("taxAmount"));
    const paidAmount = toNumber(formData.get("paidAmount"));
    const invoiceDateRaw = String(formData.get("invoiceDate") || "");
    const dueDateRaw = String(formData.get("dueDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.rate) * toNumber(item.netWeight),
      0,
    );
    const makingCharges = items.reduce((sum, item) => sum + toNumber(item.makingCharge), 0);
    const stoneCharges = items.reduce((sum, item) => sum + toNumber(item.stoneCharge), 0);
    const totalAmount = subtotal + makingCharges + stoneCharges - discount + taxAmount;
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

    const invoiceNumber = await generateInvoiceNumber(storeId);

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
          items: {
            create: items.map((item) => ({
              itemName: item.itemName,
              metalType: item.metalType ?? undefined,
              purity: item.purity ?? undefined,
              quantity: item.quantity || 1,
              grossWeight: item.grossWeight ?? undefined,
              netWeight: item.netWeight ?? undefined,
              rate: item.rate ?? undefined,
              makingCharge: item.makingCharge,
              stoneCharge: item.stoneCharge,
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
          },
        });
      }

      return created;
    });

    revalidatePath("/billing");

    return {
      success: true,
      message: `Invoice ${invoiceNumber} created`,
      invoiceId: invoice.id,
    };
  } catch (error) {
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
    const amount = toNumber(formData.get("amount"));
    const notes = String(formData.get("notes") || "").trim() || null;

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
      prisma.ledgerEntry.create({
        data: {
          storeId,
          type: LedgerEntryType.CREDIT,
          sourceType: LedgerSourceType.SALE,
          customerId: invoice.customerId,
          invoiceId,
          amount,
          description: notes ?? `Payment received for ${invoice.invoiceNumber}`,
        },
      }),
    ]);

    revalidatePath("/billing");
    revalidatePath(`/billing/${invoiceId}`);

    return { success: true, message: "Payment recorded" };
  } catch (error) {
    console.error("recordInvoicePayment error:", error);
    return { success: false, message: "Failed to record payment" };
  }
}

/** Only DRAFT invoices with no recorded payments/ledger entries can be deleted. */
export async function deleteInvoice(id: string): Promise<InvoiceFormState> {
  try {
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
