// lib/actions/notification-actions.ts
"use server";

import { InvoiceStatus } from "@prisma/client";

import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getEffectiveStoreId } from "@/lib/store-context";
import { getCurrentUser, hasPermission } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getLocationScope, locationWhere } from "@/lib/location-scope";
import { formatShortDate } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  href: string;
};

export type NotificationGroup = {
  key: "invoices" | "karigar-jobs" | "out-of-stock" | "access-requests";
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

  const [currentUser, canViewBilling, canViewKarigars, canViewInventory, scope] = await Promise.all([
    getCurrentUser(),
    hasPermission(PERMISSIONS.BILLING_VIEW),
    hasPermission(PERMISSIONS.KARIGAR_VIEW),
    hasPermission(PERMISSIONS.INVENTORY_VIEW),
    getLocationScope(),
  ]);

  // Store-owner-only, same gate as getPendingAccessRequests (the actual
  // approve/deny screen this links to) — a Super Admin asking to get into a
  // store previously only surfaced if the owner happened to visit
  // /settings/collaboration on their own; nothing ever told them a request
  // was waiting.
  const [accessRequests, accessRequestCount] =
    currentUser?.role === UserRole.ADMIN
      ? await Promise.all([
          prisma.storeAccessRequest.findMany({
            where: { storeId, status: "PENDING" },
            orderBy: { requestedAt: "desc" },
            take: 5,
            select: { id: true, requestedAt: true, superAdminUser: { select: { name: true, email: true } } },
          }),
          prisma.storeAccessRequest.count({ where: { storeId, status: "PENDING" } }),
        ])
      : [[], 0];

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
        description: invoice.customer?.name ?? "Walk-in party",
        href: `/billing/${invoice.id}`,
      })),
    });
  }

  if (overdueJobCount > 0) {
    groups.push({
      key: "karigar-jobs",
      label: "Overdue artisan jobs",
      count: overdueJobCount,
      items: overdueJobs.map((job) => ({
        id: job.id,
        title: job.jobNumber ? `Job ${job.jobNumber}` : "Artisan job",
        description: `${job.karigar.name} — expected ${formatShortDate(job.expectedDate)}`,
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

  if (accessRequestCount > 0) {
    groups.push({
      key: "access-requests",
      label: "Store access requests",
      count: accessRequestCount,
      items: accessRequests.map((request) => ({
        id: request.id,
        title: request.superAdminUser.name ?? request.superAdminUser.email ?? "A Super Admin",
        description: `Requested access ${formatShortDate(request.requestedAt)}`,
        href: "/settings/collaboration",
      })),
    });
  }

  const totalCount = dueInvoiceCount + overdueJobCount + outOfStockCount + accessRequestCount;

  return { totalCount, groups };
}
