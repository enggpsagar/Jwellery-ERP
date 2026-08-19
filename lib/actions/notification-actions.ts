// lib/actions/notification-actions.ts
"use server";

import { InvoiceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getEffectiveStoreId } from "@/lib/store-context";

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  href: string;
};

export type NotificationGroup = {
  key: "invoices" | "karigar-jobs" | "out-of-stock";
  label: string;
  count: number;
  items: NotificationItem[];
};

export type NotificationsResponse = {
  totalCount: number;
  groups: NotificationGroup[];
};

const EMPTY: NotificationsResponse = { totalCount: 0, groups: [] };

export async function getNotifications(): Promise<NotificationsResponse> {
  const storeId = await getEffectiveStoreId();
  if (!storeId) return EMPTY;

  const now = new Date();

  const [dueInvoices, dueInvoiceCount, overdueJobs, overdueJobCount, outOfStockProducts, outOfStockCount] =
    await Promise.all([
      prisma.invoice.findMany({
        where: { storeId, balanceAmount: { gt: 0 }, status: { not: InvoiceStatus.CANCELLED } },
        orderBy: { invoiceDate: "asc" },
        take: 5,
        select: { id: true, invoiceNumber: true, balanceAmount: true, customer: { select: { name: true } } },
      }),
      prisma.invoice.count({
        where: { storeId, balanceAmount: { gt: 0 }, status: { not: InvoiceStatus.CANCELLED } },
      }),
      prisma.karigarJob.findMany({
        where: { storeId, receivedDate: null, expectedDate: { lt: now } },
        orderBy: { expectedDate: "asc" },
        take: 5,
        select: { id: true, jobNumber: true, expectedDate: true, karigar: { select: { name: true } } },
      }),
      prisma.karigarJob.count({
        where: { storeId, receivedDate: null, expectedDate: { lt: now } },
      }),
      prisma.product.findMany({
        where: { storeId, isActive: true, stockItems: { none: { status: "IN_STOCK" } } },
        orderBy: { name: "asc" },
        take: 5,
        select: { id: true, name: true, productCode: true },
      }),
      prisma.product.count({
        where: { storeId, isActive: true, stockItems: { none: { status: "IN_STOCK" } } },
      }),
    ]);

  const groups: NotificationGroup[] = [];

  if (dueInvoiceCount > 0) {
    groups.push({
      key: "invoices",
      label: "Payments due",
      count: dueInvoiceCount,
      items: dueInvoices.map((invoice) => ({
        id: invoice.id,
        title: `${invoice.invoiceNumber} — ₹${Number(invoice.balanceAmount).toLocaleString("en-IN")} due`,
        description: invoice.customer?.name ?? "Walk-in customer",
        href: `/billing/${invoice.id}`,
      })),
    });
  }

  if (overdueJobCount > 0) {
    groups.push({
      key: "karigar-jobs",
      label: "Overdue karigar jobs",
      count: overdueJobCount,
      items: overdueJobs.map((job) => ({
        id: job.id,
        title: job.jobNumber ? `Job ${job.jobNumber}` : "Karigar job",
        description: `${job.karigar.name} — expected ${job.expectedDate?.toLocaleDateString("en-IN")}`,
        href: `/karigars`,
      })),
    });
  }

  if (outOfStockCount > 0) {
    groups.push({
      key: "out-of-stock",
      label: "Out of stock",
      count: outOfStockCount,
      items: outOfStockProducts.map((product) => ({
        id: product.id,
        title: product.name,
        description: `${product.productCode} has no items in stock`,
        href: `/inventory/products`,
      })),
    });
  }

  const totalCount = dueInvoiceCount + overdueJobCount + outOfStockCount;

  return { totalCount, groups };
}
