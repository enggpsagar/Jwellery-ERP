// File: src/lib/roles.ts

import { UserRole } from "@prisma/client";
import { PERMISSIONS } from "./permissions";

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS),

  // Full control, but always scoped to their own store by the query layer.
  ADMIN: Object.values(PERMISSIONS).filter(
    (permission) => !permission.startsWith("store.")
  ),

  MANAGER: [
    PERMISSIONS.DASHBOARD_VIEW,

    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_UPDATE,

    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE,

    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_CREATE,
    PERMISSIONS.INVENTORY_UPDATE,

    PERMISSIONS.SUPPLIER_VIEW,
    PERMISSIONS.SUPPLIER_CREATE,
    PERMISSIONS.SUPPLIER_UPDATE,

    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.PURCHASE_CREATE,
    PERMISSIONS.PURCHASE_UPDATE,

    PERMISSIONS.QUOTATION_VIEW,
    PERMISSIONS.QUOTATION_CREATE,
    PERMISSIONS.QUOTATION_UPDATE,

    PERMISSIONS.REPORT_VIEW,
  ],

  // "Normal users" — day-to-day sales, invoicing and inventory, no admin surfaces.
  // This is the fallback used when a Staff user has no custom module
  // selection (`User.permissions` empty) — full access to every module,
  // matching behavior before per-user module access existed.
  STAFF: [
    PERMISSIONS.DASHBOARD_VIEW,

    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_UPDATE,

    PERMISSIONS.PRODUCT_VIEW,

    PERMISSIONS.SUPPLIER_VIEW,
    PERMISSIONS.SUPPLIER_CREATE,
    PERMISSIONS.SUPPLIER_UPDATE,

    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_CREATE,
    PERMISSIONS.INVENTORY_UPDATE,

    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_CREATE,
    PERMISSIONS.BILLING_UPDATE,

    PERMISSIONS.QUOTATION_VIEW,
    PERMISSIONS.QUOTATION_CREATE,
    PERMISSIONS.QUOTATION_UPDATE,

    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.PURCHASE_CREATE,
    PERMISSIONS.PURCHASE_UPDATE,

    PERMISSIONS.KARIGAR_VIEW,
    PERMISSIONS.KARIGAR_CREATE,
    PERMISSIONS.KARIGAR_UPDATE,

    PERMISSIONS.LEDGER_VIEW,
    PERMISSIONS.LEDGER_CREATE,

    PERMISSIONS.REPORT_VIEW,
  ],

  // Karigars only ever see their own jobs — enforced by a row-level
  // karigarId check, not by this permission list, so it stays empty.
  KARIGAR: [],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MANAGER: "Manager",
  STAFF: "Staff",
  KARIGAR: "Karigar",
};

/**
 * The 6 workspace sections an Admin can toggle on/off per Staff user.
 * Dashboard always stays visible; Users/Settings/Stores stay role-gated
 * (Admin/Super Admin only) rather than per-user customizable.
 */
export type ModuleKey =
  | "customers"
  | "vendors"
  | "inventory"
  | "billing"
  | "quotations"
  | "purchases"
  | "karigars"
  | "reports"
  | "ledger";

export const MODULE_DEFINITIONS: {
  key: ModuleKey;
  label: string;
  href: string;
  permissions: string[];
}[] = [
  {
    key: "customers",
    label: "Customers",
    href: "/customers",
    permissions: [
      PERMISSIONS.CUSTOMER_VIEW,
      PERMISSIONS.CUSTOMER_CREATE,
      PERMISSIONS.CUSTOMER_UPDATE,
    ],
  },
  {
    key: "vendors",
    label: "Vendors",
    href: "/vendors",
    permissions: [
      PERMISSIONS.SUPPLIER_VIEW,
      PERMISSIONS.SUPPLIER_CREATE,
      PERMISSIONS.SUPPLIER_UPDATE,
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    href: "/inventory",
    permissions: [
      PERMISSIONS.PRODUCT_VIEW,
      PERMISSIONS.PRODUCT_CREATE,
      PERMISSIONS.PRODUCT_UPDATE,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_CREATE,
      PERMISSIONS.INVENTORY_UPDATE,
    ],
  },
  {
    key: "billing",
    label: "Billing",
    href: "/billing",
    permissions: [
      PERMISSIONS.BILLING_VIEW,
      PERMISSIONS.BILLING_CREATE,
      PERMISSIONS.BILLING_UPDATE,
    ],
  },
  {
    key: "quotations",
    label: "Quotations",
    href: "/quotations",
    permissions: [
      PERMISSIONS.QUOTATION_VIEW,
      PERMISSIONS.QUOTATION_CREATE,
      PERMISSIONS.QUOTATION_UPDATE,
    ],
  },
  {
    key: "purchases",
    label: "Purchases",
    href: "/purchases",
    permissions: [
      PERMISSIONS.PURCHASE_VIEW,
      PERMISSIONS.PURCHASE_CREATE,
      PERMISSIONS.PURCHASE_UPDATE,
    ],
  },
  {
    key: "karigars",
    label: "Karigar Management",
    href: "/karigars",
    permissions: [
      PERMISSIONS.KARIGAR_VIEW,
      PERMISSIONS.KARIGAR_CREATE,
      PERMISSIONS.KARIGAR_UPDATE,
    ],
  },
  {
    key: "reports",
    label: "Reports",
    href: "/reports",
    permissions: [PERMISSIONS.REPORT_VIEW],
  },
  {
    key: "ledger",
    label: "Ledger",
    href: "/ledger",
    permissions: [PERMISSIONS.LEDGER_VIEW, PERMISSIONS.LEDGER_CREATE],
  },
];

/**
 * Effective permission list for a user. Admin/Super Admin always get the
 * full role bundle — module customization only applies to Staff, so an
 * Admin can't accidentally lock themselves out. A Staff user with no
 * custom `permissions` saved falls back to the full STAFF bundle, so
 * existing/plain Staff accounts keep working exactly as before.
 */
export function getEffectivePermissions(user: {
  role: UserRole;
  permissions?: string[] | null;
}): string[] {
  if (user.role === UserRole.STAFF && user.permissions && user.permissions.length > 0) {
    return user.permissions;
  }

  return ROLE_PERMISSIONS[user.role] ?? [];
}