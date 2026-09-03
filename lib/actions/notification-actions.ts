// lib/actions/notification-actions.ts
"use server";

import { InvoiceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getEffectiveStoreId } from "@/lib/store-context";
import { hasPermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getLocationScope, locationWhere } from "@/lib/location-scope";

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

/**
 * Every group here is gated by the SAME two axes the rest of the app reads
 * data through — module permission (`hasPermission`, so a Karigar user,
 * whose role carries no permissions at all, or a Staff user whose Admin
 * hasn't switched on that module, sees nothing from it) and location scope
 * (`getLocationScope`/`locationWhere`, so a location-restricted Staff user
 * isn't told about payments/jobs/stock at a branch they can't otherwise see
 * anywhere else in the app). Previously this ran unconditionally for every
 * signed-in user regardless of either — the same three groups, store-wide,
 * for a Karigar and an Admin alike.
 */
export async function getNotifications(): Promise<NotificationsResponse> {
  const storeId = await getEffectiveStoreId();
  if (!storeId) return EMPTY;

  const now = new Date();

  const [canViewBilling, canViewKarigars, canViewInventory, scope] = await Promise.all([
    hasPermission(PERMISSIONS.BILLING_VIEW),
    hasPermission(PERMISSIONS.KARIGAR_VIEW),
    hasPermission(PERMISSIONS.INVENTORY_VIEW),
    getLocationScope(),
  ]);

  const [dueInvoices, dueInvoiceCount] = canViewBilling
    ? await Promise.all([
        prisma.invoice.findMany({
          where: {
            storeId,
            balanceAmount: { gt: 0 },
            status: { not: InvoiceStatus.CANCELLED },
            ...locationWhere(scope),
          },
          orderBy: { invoiceDate: "asc" },
          take: 5,
          select: { id: true, invoiceNumber: true, balanceAmount: true, customer: { select: { name: true } } },
        }),
        prisma.invoice.count({
          where: {
            storeId,
            balanceAmount: { gt: 0 },
            status: { not: InvoiceStatus.CANCELLED },
            ...locationWhere(scope),
          },
        }),
      ])
    : [[], 0];

  const [overdueJobs, overdueJobCount] = canViewKarigars
    ? await Promise.all([
        prisma.karigarJob.findMany({
          where: { storeId, receivedDate: null, expectedDate: { lt: now }, ...locationWhere(scope) },
          orderBy: { expectedDate: "asc" },
          take: 5,
          select: { id: true, jobNumber: true, expectedDate: true, karigar: { select: { name: true } } },
        }),
        prisma.karigarJob.count({
          where: { storeId, receivedDate: null, expectedDate: { lt: now }, ...locationWhere(scope) },
        }),
      ])
    : [[], 0];

  // Product itself carries no locationId (it's a store-wide catalog entry —
  // InventoryStock is what's physically at a location), so the location
  // scope applies inside the stockItems relation instead: "out of stock"
  // means no IN_STOCK row at a location this user can see, not literally
  // zero stock anywhere in the store.
  const [outOfStockProducts, outOfStockCount] = canViewInventory
    ? await Promise.all([
        prisma.product.findMany({
          where: {
            storeId,
            isActive: true,
            stockItems: { none: { status: "IN_STOCK", ...locationWhere(scope) } },
          },
          orderBy: { name: "asc" },
          take: 5,
          select: { id: true, name: true, productCode: true },
        }),
        prisma.product.count({
          where: {
            storeId,
            isActive: true,
            stockItems: { none: { status: "IN_STOCK", ...locationWhere(scope) } },
          },
        }),
      ])
    : [[], 0];

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
