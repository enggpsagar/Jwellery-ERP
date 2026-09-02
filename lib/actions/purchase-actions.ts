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
  dmoWeight?: number | null;
  hsnCode?: string | null;
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

function lineTotal(item: PurchaseLineItemInput) {
  const metalValue = toNumber(item.rate) * lineQuantity(item);
  return metalValue + toNumber(item.makingCharge) + toNumber(item.stoneCharge);
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
    paidAmount: Number(purchase.paidAmount),
    balanceAmount: Number(purchase.balanceAmount),
    notes: purchase.notes,
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
      dmoWeight: item.dmoWeight ? Number(item.dmoWeight) : null,
      hsnCode: item.hsnCode ?? null,
      lineTotal: Number(item.lineTotal),
      inventoryStockId: item.inventoryStockId,
    })),
  };
}

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
      Date: new Date(purchase.purchaseDate).toLocaleDateString("en-IN"),
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
    select: { id: true, name: true, phone: true, vendorCode: true },
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
  }));
}

/**
 * Create a purchase with its line items in one transaction. Unlike an
 * invoice (which marks existing stock SOLD), every purchase line creates a
 * brand new InventoryStock row — stock comes IN, it doesn't go out. If the
 * purchase isn't fully paid up front, a CREDIT ledger entry is recorded
 * against the vendor for the outstanding amount (the shop owes the vendor —
 * opposite direction from a sale's customer-owes-shop DEBIT).
 */
export async function createPurchase(
  prevState: PurchaseFormState = initialState,
  formData: FormData,
): Promise<PurchaseFormState> {
  try {
    // Authorization lives here, not only in middleware: a server action is a
    // POST endpoint that can be invoked from any page the caller is allowed
    // to load, so the route guard never sees it.
    try {
      await requirePermission(PERMISSIONS.PURCHASE_CREATE);
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

    if (items.some((item) => !item.productId)) {
      return { success: false, message: "Every line item must have a product selected" };
    }

    // Don't trust client-submitted charge type — coerce anything unexpected
    // (missing, malformed, or a value outside the enum) down to FIXED.
    items = items.map((item) => ({
      ...item,
      makingChargeType: toChargeType(item.makingChargeType),
    }));

    const discount = toNumber(formData.get("discount"));
    const taxAmount = toNumber(formData.get("taxAmount"));
    const paidAmount = toNumber(formData.get("paidAmount"));
    const purchaseDateRaw = String(formData.get("purchaseDate") || "");
    const notes = String(formData.get("notes") || "").trim() || null;
    const vendorInvoiceNumber = String(formData.get("vendorInvoiceNumber") || "").trim() || null;

    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.rate) * lineQuantity(item),
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

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, storeId },
      select: { id: true, name: true },
    });
    if (!vendor) {
      return { success: false, message: "Please select a vendor" };
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      return { success: false, message: "One or more selected products are invalid" };
    }

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
        return { success: false, message: "You don't have access to file a purchase against this location" };
      }
    }

    const purchaseNumber = await generatePurchaseNumber(storeId);
    const purchaseDate = purchaseDateRaw ? new Date(purchaseDateRaw) : new Date();

    // Mint all stock codes off one base count before any writes happen, so
    // each sequential offset lands on a distinct number.
    const stockCodes: string[] = [];
    for (let i = 0; i < items.length; i++) {
      stockCodes.push(await generateStockCode(storeId, i));
    }

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
            purchaseRate: toDecimal(item.rate),
            purchaseAmount: toDecimal(lineTotal(item)),
            makingCharge: toDecimal(item.makingCharge),
            makingChargeType: toChargeType(item.makingChargeType),
            stoneCharge: toDecimal(item.stoneCharge),
            vendorId,
            vendorName: vendor.name,
            purchaseDate,
            locationId: locationId ?? undefined,
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
          totalAmount,
          paidAmount,
          balanceAmount,
          notes,
          vendorInvoiceNumber,
          locationId: locationId ?? undefined,
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
              dmoWeight: item.dmoWeight ?? undefined,
              hsnCode: item.hsnCode ?? undefined,
              lineTotal: lineTotal(item),
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
            locationId: locationId ?? undefined,
          },
        });
      }

      return created;
    });

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
            sourceType: LedgerSourceType.PURCHASE,
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

    const stockUntouched = purchase.items.every(
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

    const stockIds = purchase.items
      .map((item) => item.inventoryStockId)
      .filter((value): value is string => Boolean(value));

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
