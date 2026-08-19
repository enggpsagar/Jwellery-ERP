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

    PERMISSIONS.REPORT_VIEW,
  ],

  // "Normal users" — day-to-day sales, invoicing and inventory, no admin surfaces.
  STAFF: [
    PERMISSIONS.DASHBOARD_VIEW,

    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_UPDATE,

    PERMISSIONS.PRODUCT_VIEW,

    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_CREATE,
    PERMISSIONS.INVENTORY_UPDATE,
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