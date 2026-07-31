// lib/actions/report-actions.ts
"use server";

import { InventoryStockStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
  const where = toDateRangeWhere(range, "invoiceDate");

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { invoiceDate: "desc" },
    include: {
      customer: { select: { name: true } },
      items: { select: { metalType: true, netWeight: true, lineTotal: true } },
    },
  });

  const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const totalMakingCharges = invoices.reduce((sum, inv) => sum + Number(inv.makingCharges), 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balanceAmount), 0);

  const byMetal = new Map<string, { weight: number; amount: number }>();
  for (const invoice of invoices) {
    for (const item of invoice.items) {
      const key = item.metalType ?? "OTHER";
      const entry = byMetal.get(key) ?? { weight: 0, amount: 0 };
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
    byMetal: Array.from(byMetal.entries()).map(([metalType, data]) => ({
      metalType,
      ...data,
    })),
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
  const stockItems = await prisma.inventoryStock.findMany({
    where: { isActive: true },
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
  const openJobs = await prisma.karigarJob.findMany({
    where: { receivedDate: null },
    orderBy: { issueDate: "desc" },
    include: { karigar: { select: { name: true, code: true } } },
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
      metalType: job.metalType,
    })),
  };
}

/**
 * Customers with an outstanding balance across their invoices, highest
 * dues first.
 */
export async function getCustomerDuesReport() {
  const customers = await prisma.customer.findMany({
    where: { isActive: true, isArchived: false },
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
