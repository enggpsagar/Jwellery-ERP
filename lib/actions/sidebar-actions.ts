// lib/actions/sidebar-actions.ts
"use server"

import { UserRole } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { getLocationScope, locationWhere } from "@/lib/location-scope"

export type SidebarCounts = {
  customers: number
  vendors: number
  products: number
  stock: number
  purchases: number
  karigars: number
  quotations: number
  invoices: number
  kachaInvoices: number
  creditNotes: number
  users: number
  stores: number
}

const EMPTY_COUNTS: SidebarCounts = {
  customers: 0,
  vendors: 0,
  products: 0,
  stock: 0,
  purchases: 0,
  karigars: 0,
  quotations: 0,
  invoices: 0,
  kachaInvoices: 0,
  creditNotes: 0,
  users: 0,
  stores: 0,
}

/**
 * Counts shown as sidebar badges. Each one mirrors its list page's own
 * default filter exactly (Customer/Vendor: isArchived false; Karigar:
 * isActive true; Product/Purchase/Quotation/Invoice/KachaInvoice: no extra
 * status filter, matching what those pages show by default) so a badge
 * never disagrees with what that page actually lists. Location-scoped
 * models (InventoryStock, Purchase, Karigar, Quotation, Invoice,
 * KachaInvoice) go through the same getLocationScope()/locationWhere() a
 * Staff user's own list queries use — Customer/Vendor/Product/User carry no
 * locationId column at all, per schema.
 */
export async function getSidebarCounts(
  storeId: string | null,
  role?: UserRole,
): Promise<SidebarCounts> {
  // A Super Admin with no store selected yet (platform level) — every
  // other count is store-scoped and meaningless without one.
  if (!storeId) {
    const [stores, users] = await Promise.all([
      prisma.store.count(),
      prisma.user.count({ where: { role: UserRole.SUPER_ADMIN } }),
    ])
    return { ...EMPTY_COUNTS, stores, users }
  }

  const scope = await getLocationScope()
  const withLocation = locationWhere(scope)

  const [
    customers,
    vendors,
    products,
    stock,
    purchases,
    karigars,
    quotations,
    invoices,
    kachaInvoices,
    creditNotes,
    users,
    stores,
  ] = await Promise.all([
    prisma.customer.count({ where: { storeId, isArchived: false } }),
    prisma.vendor.count({ where: { storeId, isArchived: false } }),
    prisma.product.count({ where: { storeId } }),
    prisma.inventoryStock.count({ where: { storeId, ...withLocation } }),
    prisma.purchase.count({ where: { storeId, ...withLocation } }),
    prisma.karigar.count({ where: { storeId, isActive: true, ...withLocation } }),
    prisma.quotation.count({ where: { storeId, ...withLocation } }),
    prisma.invoice.count({ where: { storeId, ...withLocation } }),
    prisma.kachaInvoice.count({ where: { storeId, ...withLocation } }),
    // No locationId on CreditNote — matches getCreditNotes()'s own filter.
    prisma.creditNote.count({ where: { storeId } }),
    prisma.user.count({ where: { storeId } }),
    // Only a Super Admin's sidebar shows "Stores" at all (see
    // getNavForRole in app-sidebar.tsx) — a plain count query is cheap
    // enough to skip gating twice, but there's no reason to run it for
    // roles that will never render the badge.
    role === UserRole.SUPER_ADMIN ? prisma.store.count() : Promise.resolve(0),
  ])

  return {
    customers,
    vendors,
    products,
    stock,
    purchases,
    karigars,
    quotations,
    invoices,
    kachaInvoices,
    creditNotes,
    users,
    stores,
  }
}
