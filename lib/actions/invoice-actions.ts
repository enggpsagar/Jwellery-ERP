// lib/actions/invoice-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  InvoiceStatus,
  InventoryStockStatus,
  InventoryTransactionType,
  LedgerEntryType,
  LedgerSourceType,
  PaymentMethod,
  PurityType,
  ChargeType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { requireStoreScope, resolveActingStoreId } from "@/lib/store-context";
import {
  getLocationScope,
  locationWhere,
  isLocationAllowed,
  type LocationScope,
} from "@/lib/location-scope";
import { sendMail } from "@/lib/mailer";
import { invoiceEmail } from "@/lib/email-templates";
import { resolveStoreName } from "@/lib/invite-email";
import { buildExcelExport } from "@/lib/excel-export";

export type InvoiceLineItemInput = {
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

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

/** Never trust client input for the making-charge mode — anything other
 * than a valid ChargeType falls back to FIXED. */
function toChargeType(value: unknown): ChargeType {
  return value === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
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
  rate: number | null;
  makingCharge: number;
  makingChargeType: ChargeType;
  stoneCharge: number;
  dmoWeight: number | null;
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
    customer: invoice.customer
      ? {
          id: invoice.customer.id,
          name: invoice.customer.name,
          phone: invoice.customer.phone,
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
      rate: item.rate ? Number(item.rate) : null,
      makingCharge: Number(item.makingCharge),
      makingChargeType: item.makingChargeType as ChargeType,
      stoneCharge: Number(item.stoneCharge),
      dmoWeight: item.dmoWeight ? Number(item.dmoWeight) : null,
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
      Date: new Date(invoice.invoiceDate).toLocaleDateString("en-IN"),
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
    include: {
      product: { select: { name: true } },
      metalType: { select: { id: true, name: true } },
    },
  });

  return stockItems.map((stock) => ({
    id: stock.id,
    stockCode: stock.stockCode,
    productName: stock.product.name,
    metalType: stock.metalType
      ? { id: stock.metalType.id, name: stock.metalType.name }
      : null,
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
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.BILLING_CREATE);
    } catch {
      return { success: false, message: "You do not have permission to create invoices." };
    }
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

    // A caller may name the store explicitly — the QR scan-to-sell path does,
    // because it resolves the shop from the scanned piece rather than from
    // whichever store the phone happened to have active. `resolveActingStoreId`
    // honours it only for a store the user is genuinely a member of, so this
    // is no weaker than the store switcher; with nothing named it falls back
    // to the active store exactly as before.
    const storeId = await resolveActingStoreId(
      String(formData.get("storeId") || "") || null,
    );

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

        // Decrement rather than flipping the whole row to SOLD: a row of
        // 100 pieces that sells 2 still has 98 on hand. Marking it SOLD
        // outright made the remainder disappear from stock entirely.
        // `decrement` is applied by the database, so concurrent sales of the
        // same row cannot both read the same starting quantity.
        const soldQty = Math.max(1, item.quantity || 1);
        const currentStock = await tx.inventoryStock.findFirst({
          where: { id: item.inventoryStockId, storeId },
          select: { quantity: true },
        });
        if (!currentStock) continue;

        const remaining = currentStock.quantity - soldQty;

        const { count } = await tx.inventoryStock.updateMany({
          where: { id: item.inventoryStockId, storeId },
          data: {
            quantity: { decrement: soldQty },
            // Only the last piece leaving turns the row SOLD.
            ...(remaining <= 0 ? { status: InventoryStockStatus.SOLD } : {}),
            saleAmount: lineTotal(item),
          },
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
            sourceType: LedgerSourceType.SALE,
            customerId: invoice.customerId,
            invoiceId,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
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

    const [invoice, storeName] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id: invoiceId, storeId },
        include: {
          customer: { select: { name: true, email: true } },
          items: true,
        },
      }),
      resolveStoreName(storeId),
    ]);

    if (!invoice) return { success: false, message: "Invoice not found" };

    if (!invoice.customer?.email) {
      return { success: false, message: "This customer has no email on file" };
    }

    const { subject, html } = invoiceEmail({
      storeName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      customerName: invoice.customer.name,
      items: invoice.items.map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        netWeight: item.netWeight ? Number(item.netWeight) : null,
        rate: item.rate ? Number(item.rate) : null,
        makingCharge: Number(item.makingCharge),
        stoneCharge: Number(item.stoneCharge),
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
    });

    const result = await sendMail({ to: invoice.customer.email, subject, html });

    return { success: result.sent, message: result.message };
  } catch (error) {
    console.error("emailInvoiceAction error:", error);
    return { success: false, message: "Failed to email invoice" };
  }
}
