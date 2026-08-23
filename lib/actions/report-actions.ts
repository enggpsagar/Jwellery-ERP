// lib/actions/report-actions.ts
"use server";

import { InventoryStockStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { getFinenessMap, toFineWeight } from "@/lib/purity";

export type DateRange = { from?: string; to?: string };

function toDateRangeWhere(range: DateRange, field: string) {
  if (!range.from && !range.to) return {};

  return {
    [field]: {
      ...(range.from ? { gte: new Date(range.from) } : {}),
      ...(range.to ? { lte: new Date(range.to) } : {}),
    },
  };
}

/**
 * Sales summary for a date range: revenue, charges collected, and a
 * breakdown by metal type across invoice line items.
 */
export async function getSalesReport(range: DateRange = {}) {
  const storeId = await requireStoreScope();
  const where = { storeId, ...toDateRangeWhere(range, "invoiceDate") };

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { invoiceDate: "desc" },
    include: {
      customer: { select: { name: true } },
      items: {
        select: {
          metalType: { select: { id: true, name: true } },
          netWeight: true,
          lineTotal: true,
        },
      },
    },
  });

  const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const totalMakingCharges = invoices.reduce((sum, inv) => sum + Number(inv.makingCharges), 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balanceAmount), 0);

  const byMetal = new Map<string, { name: string; weight: number; amount: number }>();
  for (const invoice of invoices) {
    for (const item of invoice.items) {
      const key = item.metalType?.id ?? "unassigned";
      const name = item.metalType?.name ?? "Unassigned";
      const entry = byMetal.get(key) ?? { name, weight: 0, amount: 0 };
      entry.weight += item.netWeight ? Number(item.netWeight) : 0;
      entry.amount += Number(item.lineTotal);
      byMetal.set(key, entry);
    }
  }

  return {
    invoiceCount: invoices.length,
    totalRevenue,
    totalMakingCharges,
    totalOutstanding,
    byMetal: Array.from(byMetal.values()),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      customerName: inv.customer.name,
      status: inv.status,
      totalAmount: Number(inv.totalAmount),
      balanceAmount: Number(inv.balanceAmount),
    })),
  };
}

/**
 * Current inventory valuation: active stock grouped by status, with
 * weight and an estimated value (sale rate x quantity where set).
 */
export async function getInventoryValuationReport() {
  const storeId = await requireStoreScope();
  const stockItems = await prisma.inventoryStock.findMany({
    where: { storeId, isActive: true },
    include: { product: { select: { name: true, category: true } } },
  });

  const byStatus = new Map<
    string,
    { count: number; netWeight: number; estimatedValue: number }
  >();

  for (const stock of stockItems) {
    const entry = byStatus.get(stock.status) ?? {
      count: 0,
      netWeight: 0,
      estimatedValue: 0,
    };
    entry.count += 1;
    entry.netWeight += stock.netWeight ? Number(stock.netWeight) : 0;
    entry.estimatedValue += stock.saleRate
      ? Number(stock.saleRate) * stock.quantity
      : Number(stock.purchaseAmount ?? 0);
    byStatus.set(stock.status, entry);
  }

  const inStockValue = byStatus.get(InventoryStockStatus.IN_STOCK)?.estimatedValue ?? 0;

  return {
    totalItems: stockItems.length,
    inStockValue,
    byStatus: Array.from(byStatus.entries()).map(([status, data]) => ({
      status,
      ...data,
    })),
  };
}

/**
 * Open karigar jobs — stock currently out with a karigar and not yet
 * received back, with total gold/silver weight outstanding per karigar.
 */
export async function getKarigarOutstandingReport() {
  const storeId = await requireStoreScope();
  const openJobs = await prisma.karigarJob.findMany({
    where: { storeId, receivedDate: null },
    orderBy: { issueDate: "desc" },
    include: {
      karigar: { select: { name: true, code: true } },
      metalType: { select: { name: true } },
    },
  });

  const byKarigar = new Map<string, { name: string; jobs: number; weightOut: number }>();

  for (const job of openJobs) {
    const key = job.karigarId;
    const entry = byKarigar.get(key) ?? {
      name: job.karigar.name,
      jobs: 0,
      weightOut: 0,
    };
    entry.jobs += 1;
    entry.weightOut += job.issueWeight ? Number(job.issueWeight) : 0;
    byKarigar.set(key, entry);
  }

  return {
    openJobCount: openJobs.length,
    byKarigar: Array.from(byKarigar.values()),
    jobs: openJobs.map((job) => ({
      id: job.id,
      jobNumber: job.jobNumber,
      karigarName: job.karigar.name,
      issueDate: job.issueDate.toISOString(),
      expectedDate: job.expectedDate?.toISOString() ?? null,
      issueWeight: job.issueWeight ? Number(job.issueWeight) : null,
      metalType: job.metalType?.name ?? null,
    })),
  };
}

/**
 * Customers with an outstanding balance across their invoices, highest
 * dues first.
 */
export async function getCustomerDuesReport() {
  const storeId = await requireStoreScope();
  const customers = await prisma.customer.findMany({
    where: { storeId, isActive: true, isArchived: false },
    include: {
      invoices: {
        where: { balanceAmount: { gt: 0 } },
        select: { id: true, invoiceNumber: true, balanceAmount: true },
      },
    },
  });

  const withDues = customers
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      totalDue: customer.invoices.reduce(
        (sum, inv) => sum + Number(inv.balanceAmount),
        0,
      ),
      invoiceCount: customer.invoices.length,
    }))
    .filter((customer) => customer.totalDue > 0)
    .sort((a, b) => b.totalDue - a.totalDue);

  return {
    customerCount: withDues.length,
    totalDue: withDues.reduce((sum, c) => sum + c.totalDue, 0),
    customers: withDues,
  };
}

/**
 * Gold-flow reconciliation: tracks every gram of fine metal from purchase
 * through karigar work-in-progress to sale/remaining stock, for a date
 * range (date-ranged flow figures) alongside point-in-time balances
 * (remaining stock, still-with-karigar) shown for context regardless of
 * range. `reconciliationGap` is the "strict tracking" signal — near-zero
 * means everything purchased is accounted for; a real gap surfaces
 * unexplained shrinkage instead of hiding it.
 */
export async function getGoldFlowReport(range: DateRange = {}) {
  const storeId = await requireStoreScope();
  const fineness = await getFinenessMap(storeId);

  const purchaseItems = await prisma.purchaseItem.findMany({
    where: { purchase: { storeId, ...toDateRangeWhere(range, "purchaseDate") } },
    include: { purchase: { select: { purchaseDate: true } } },
  });

  const purchasedFine = purchaseItems.reduce(
    (sum, item) => sum + toFineWeight(Number(item.netWeight ?? 0), item.purity, fineness),
    0,
  );

  const itemsCreatedFromPurchaseCount = purchaseItems.filter(
    (item) => item.inventoryStockId !== null,
  ).length;

  const issuedAgg = await prisma.karigarJob.aggregate({
    where: { storeId, ...toDateRangeWhere(range, "issueDate") },
    _sum: { issueFineWeight: true },
  });
  const issuedToKarigarFine = Number(issuedAgg._sum.issueFineWeight ?? 0);

  const receivedAgg = await prisma.karigarJob.aggregate({
    where: { storeId, receivedDate: { not: null }, ...toDateRangeWhere(range, "receivedDate") },
    _sum: { receiveFineWeight: true },
  });
  const receivedFromKarigarFine = Number(receivedAgg._sum.receiveFineWeight ?? 0);

  const karigarReceiptItems = await prisma.karigarReceiptItem.findMany({
    where: { karigarJob: { storeId }, ...toDateRangeWhere(range, "createdAt") },
  });

  const wastageFine = karigarReceiptItems.reduce(
    (sum, item) =>
      sum + Number(item.fineWeight) * (Number(item.wastagePercent ?? 0) / 100),
    0,
  );
  const itemsCreatedFromKarigarCount = karigarReceiptItems.length;

  const [invoiceItems, kachaInvoiceItems] = await Promise.all([
    prisma.invoiceItem.findMany({
      where: { invoice: { storeId, ...toDateRangeWhere(range, "invoiceDate") } },
      include: { inventoryStock: { select: { purity: true } } },
    }),
    prisma.kachaInvoiceItem.findMany({
      where: { kachaInvoice: { storeId, ...toDateRangeWhere(range, "invoiceDate") } },
      include: { inventoryStock: { select: { purity: true } } },
    }),
  ]);

  const soldFine =
    invoiceItems.reduce(
      (sum, item) =>
        sum +
        toFineWeight(
          Number(item.netWeight ?? 0),
          item.purity ?? item.inventoryStock?.purity ?? null,
          fineness,
        ),
      0,
    ) +
    kachaInvoiceItems.reduce(
      (sum, item) =>
        sum +
        toFineWeight(
          Number(item.netWeight ?? 0),
          item.purity ?? item.inventoryStock?.purity ?? null,
          fineness,
        ),
      0,
    );

  const itemsSoldCount =
    invoiceItems.filter((item) => item.inventoryStockId !== null).length +
    kachaInvoiceItems.filter((item) => item.inventoryStockId !== null).length;

  const remainingStock = await prisma.inventoryStock.findMany({
    where: {
      storeId,
      status: { in: [InventoryStockStatus.IN_STOCK, InventoryStockStatus.RESERVED] },
    },
    select: { netWeight: true, purity: true },
  });
  const remainingStockFine = remainingStock.reduce(
    (sum, stock) => sum + toFineWeight(Number(stock.netWeight ?? 0), stock.purity, fineness),
    0,
  );

  const withKarigarAgg = await prisma.karigarJob.aggregate({
    where: { storeId, receivedDate: null },
    _sum: { issueFineWeight: true },
  });
  const withKarigarFine = Number(withKarigarAgg._sum.issueFineWeight ?? 0);

  const itemsRemainingCount = await prisma.inventoryStock.count({
    where: { storeId, status: InventoryStockStatus.IN_STOCK },
  });

  const itemsCreatedCount = itemsCreatedFromPurchaseCount + itemsCreatedFromKarigarCount;

  const reconciliationGap =
    Math.round(
      (purchasedFine - soldFine - wastageFine - remainingStockFine - withKarigarFine) * 1000,
    ) / 1000;

  return {
    purchasedFine,
    issuedToKarigarFine,
    receivedFromKarigarFine,
    wastageFine,
    soldFine,
    remainingStockFine,
    withKarigarFine,
    itemsSoldCount,
    itemsCreatedCount,
    itemsRemainingCount,
    reconciliationGap,
  };
}
