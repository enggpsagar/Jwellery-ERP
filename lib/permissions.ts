export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: "dashboard.view",

  // Customers
  CUSTOMER_VIEW: "customer.view",
  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_UPDATE: "customer.update",
  CUSTOMER_DELETE: "customer.delete",

  // Products
  PRODUCT_VIEW: "product.view",
  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",

  // Inventory
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_CREATE: "inventory.create",
  INVENTORY_UPDATE: "inventory.update",
  INVENTORY_DELETE: "inventory.delete",

  // Suppliers
  SUPPLIER_VIEW: "supplier.view",
  SUPPLIER_CREATE: "supplier.create",
  SUPPLIER_UPDATE: "supplier.update",
  SUPPLIER_DELETE: "supplier.delete",

  // Billing (Pakka + Kacha invoices)
  BILLING_VIEW: "billing.view",
  BILLING_CREATE: "billing.create",
  BILLING_UPDATE: "billing.update",
  BILLING_DELETE: "billing.delete",

  // Quotations
  QUOTATION_VIEW: "quotation.view",
  QUOTATION_CREATE: "quotation.create",
  QUOTATION_UPDATE: "quotation.update",
  QUOTATION_DELETE: "quotation.delete",

  // Purchases (vendor purchase invoices, add stock)
  PURCHASE_VIEW: "purchase.view",
  PURCHASE_CREATE: "purchase.create",
  PURCHASE_UPDATE: "purchase.update",
  PURCHASE_DELETE: "purchase.delete",

  // Karigar management
  KARIGAR_VIEW: "karigar.view",
  KARIGAR_CREATE: "karigar.create",
  KARIGAR_UPDATE: "karigar.update",
  KARIGAR_DELETE: "karigar.delete",

  // Gold & Silver Ledger
  LEDGER_VIEW: "ledger.view",
  LEDGER_CREATE: "ledger.create",

  // Reports
  REPORT_VIEW: "report.view",
  REPORT_EXPORT: "report.export",

  // Users
  USER_VIEW: "user.view",
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_DELETE: "user.delete",

  // Settings
  SETTINGS_VIEW: "settings.view",
  SETTINGS_UPDATE: "settings.update",

  // Stores (Super Admin only)
  STORE_VIEW: "store.view",
  STORE_CREATE: "store.create",
  STORE_UPDATE: "store.update",
  STORE_DELETE: "store.delete",
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];