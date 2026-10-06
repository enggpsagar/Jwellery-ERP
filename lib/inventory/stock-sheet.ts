import type { InventoryStockStatus } from "@prisma/client"

import { ALL_SHEET_FEATURES, sheetColumnsFor, type SheetFeature, type SheetFeatures } from "../sheet-features"

/**
 * The stock spreadsheet's columns — one definition shared by the stock import
 * template, its Instructions sheet and the stock export, so all three carry
 * the same headers in the Add Stock form's order. importInventoryStockFromExcel
 * reads columns by these header names; the "export only" ones at the end are
 * written by the export for reference and ignored on import.
 */
export type StockSheetColumn = {
  header: string
  required: string
  help: string
  example: string | number
  /** Only in this store's sheets while the feature is on (lib/sheet-features.ts). */
  feature?: SheetFeature
}

export const STOCK_SHEET_COLUMNS: StockSheetColumn[] = [
  // Stock Information
  {
    header: "Product Code",
    required: "Yes",
    help: "Code of an existing product (Inventory › Products, see the dropdown). The import only adds stock for products already in the system — it never creates products.",
    example: "G22-LR-001",
  },
  {
    header: "Product Name",
    required: "No — reference only",
    help: "Filled in by the export so you can read the sheet; ignored on import (the product comes from Product Code).",
    example: "",
  },
  {
    header: "Stock Code",
    required: "No",
    help: "Blank = the next STK-YYYY-NNNN number automatically. If given, it must not already exist — clear the codes in an exported file to import its rows as new pieces.",
    example: "",
  },
  { header: "Tag Number", required: "No", help: "The piece's tag.", example: "TAG-101" },
  {
    header: "Status",
    required: "No (default In Stock)",
    help: "In Stock, Reserved or Damaged. (Sold / With Artisan / Archived come from sales, artisan jobs and archiving, not imports.)",
    example: "In Stock",
  },
  {
    header: "Finish",
    required: "No (default: the product's)",
    help: "Unfinished or Finished / Hallmarked. Blank takes the product's own Finish.",
    example: "Unfinished",
  },
  // Weight Details
  { header: "Quantity", required: "No (default 1)", help: "Number of pieces in this entry (whole number, 1 or more).", example: 1 },
  {
    header: "Gross Weight (g)",
    required: "Yes, or blank for the product's",
    help: "This piece's gross weight in grams. Blank takes the product's typical gross weight.",
    example: 3.46,
  },
  { header: "Less Weight (g)", required: "No", help: "Weight to deduct (grams).", example: "" },
  {
    header: "Net Weight (g)",
    required: "Yes, or blank to work it out",
    help: "Blank = Gross − Less − Stone weight (same as the form); if none of those are given either, the product's typical net weight.",
    example: 3.374,
  },
  {
    header: "Stone Weight (g)",
    required: "No",
    help: "Stone weight in grams. Blank takes the product's.",
    example: 0.086,
  },
  {
    header: "Carat Weight (ct)",
    required: "No",
    help: "Stone weight in carats. Blank takes the product's. For a product with a stone rate, the stone charge = this × the product's rate (same as the form).",
    example: 0.43,
  },
  // Pricing Details
  { header: "Purchase Rate", required: "No", help: "Rate per gram (₹).", example: "" },
  { header: "Sale Rate", required: "No", help: "Rate per gram (₹).", example: "" },
  { header: "Other Charge", required: "No", help: "Any other charge (₹).", example: "" },
  { header: "Purchase Amount", required: "No", help: "Total purchase amount (₹).", example: "" },
  { header: "Sale Amount", required: "No", help: "Total sale amount (₹).", example: "" },
  // Purchase Details
  { header: "Vendor Name", required: "No", help: "Who it was bought from.", example: "" },
  { header: "Purchase Date", required: "No", help: "DD/MM/YYYY (or an Excel date).", example: "" },
  { header: "Date of Manufacture", required: "No", help: "DD/MM/YYYY (or an Excel date).", example: "" },
  {
    header: "Location",
    feature: "locations",
    required: "No",
    help: "Store location (Settings › Locations, see the dropdown). Blank = your default location.",
    example: "",
  },
  { header: "Remarks", required: "No", help: "Notes about this piece.", example: "" },
  // Export-only reference columns
  { header: "Metal Type", required: "No — export only", help: "From the product. Filled in by the export; ignored on import.", example: "" },
  { header: "Purity", required: "No — export only", help: "From the product. Filled in by the export; ignored on import.", example: "" },
  { header: "Fine Weight (g)", required: "No — export only", help: "Worked out from Net Weight and purity. Ignored on import.", example: "" },
  {
    header: "Metals & Stones",
    required: "No — export only",
    help: "A purchased piece's own metal/stone breakdown. Ignored on import.",
    example: "",
  },
  { header: "Created At", required: "No — export only", help: "When the entry was created. Ignored on import.", example: "" },
]

/** Every header, every feature on (the demo store's layout). */
export const STOCK_SHEET_HEADERS = STOCK_SHEET_COLUMNS.map((column) => column.header)

/** The columns this store's stock sheets carry. */
export function stockSheetColumns(features: SheetFeatures = ALL_SHEET_FEATURES) {
  return sheetColumnsFor(STOCK_SHEET_COLUMNS, features)
}

export function stockSheetHeaders(features: SheetFeatures = ALL_SHEET_FEATURES) {
  return stockSheetColumns(features).map((column) => column.header)
}

export const STOCK_SHEET_NOTES = [
  "How to fill in the Stock sheet",
  "• One row per stock entry (piece or lot). Replace or delete the example row before importing.",
  "• Product Code must be a product that already exists — the import only adds stock, it never creates products.",
  "• Blank weights are taken from the product, the way the Add Stock form pre-fills them.",
  "• Columns can be in any order — they are matched by header name, so don't rename the headers. Columns marked \"export only\" are ignored.",
  "• Dropdowns list your store's own products, locations and options. The Options sheet shows every list.",
  "• Nothing is imported if any row has an error — the import lists each problem with its row number.",
  "• Each imported entry is added to the Ledger as stock added, the same as Add Stock.",
]

export function stockSheetInstructions(features: SheetFeatures = ALL_SHEET_FEATURES) {
  return stockSheetColumns(features).map((column, index) => ({
    "#": index + 1,
    Column: column.header,
    Required: column.required,
    "What to enter": column.help,
  }))
}

export const STOCK_STATUS_LABELS: Record<InventoryStockStatus, string> = {
  IN_STOCK: "In Stock",
  SOLD: "Sold",
  RESERVED: "Reserved",
  ISSUED_TO_KARIGAR: "With Artisan",
  DAMAGED: "Damaged",
  ARCHIVED: "Archived",
}

/** Statuses an import may set — the rest come from their own flows. */
export const IMPORTABLE_STOCK_STATUSES: InventoryStockStatus[] = ["IN_STOCK", "RESERVED", "DAMAGED"]

export function parseImportStockStatus(raw: string): InventoryStockStatus | null {
  const value = raw.trim().toLowerCase().replace(/_/g, " ")
  return IMPORTABLE_STOCK_STATUSES.find((status) => STOCK_STATUS_LABELS[status].toLowerCase() === value || status.toLowerCase().replace(/_/g, " ") === value) ?? null
}

/**
 * A date from a spreadsheet cell, read day-first for slash/dash/dot values
 * (the Indian way, and how the export writes them) — same rule as the Kacha
 * import's parseSheetDate. Anything else (ISO, an Excel date) falls through.
 */
export function parseSheetDate(raw: string): Date | null {
  if (!raw) return null
  const dayFirst = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(raw)
  if (dayFirst) {
    const [, d, m, y] = dayFirst
    const day = Number(d)
    const month = Number(m)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(Number(y), month - 1, day, 12)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** DD/MM/YYYY — what parseSheetDate reads back. */
export function formatSheetDate(value: Date | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
}
