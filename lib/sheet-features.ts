/**
 * Which optional columns a store's spreadsheets carry — one small object,
 * read once per request by getSheetFeatures() (lib/sheet-features.server.ts),
 * that every import template, export and import filters its columns,
 * Instructions rows and dropdowns with. A column tied to a feature the store
 * has switched off (Settings) or a master it has never set up is left out of
 * the template and the export, and ignored by the import if an older file
 * still has it — never an error, never written. Stored data is never touched:
 * disabled = hidden, not deleted.
 *
 * Client-safe: no DB access here.
 */
export type SheetFeatures = {
  /** BusinessSettings.styleFieldEnabled — Style on products. */
  style: boolean
  /** BusinessSettings.ewayBillEnabled — E-way Bill fields on invoices. */
  ewayBill: boolean
  /** BusinessSettings.eInvoiceEnabled — E-Invoice (IRN) fields on invoices. */
  eInvoice: boolean
  /** BusinessSettings.sendToArtisanEnabled — Draft Order → artisan job. */
  sendToArtisan: boolean
  /** The store has at least one Location (Settings › Locations). */
  locations: boolean
  /** The store has at least one GST Rate (Settings › GST Rates). */
  gstRates: boolean
}

export type SheetFeature = keyof SheetFeatures

/** Every optional column shown — BusinessSettings' own defaults. */
export const ALL_SHEET_FEATURES: SheetFeatures = {
  style: true,
  ewayBill: true,
  eInvoice: true,
  sendToArtisan: true,
  locations: true,
  gstRates: true,
}

/** A sheet column that may hang off a feature. */
export type FeatureGatedColumn = { header: string; feature?: SheetFeature }

export function isSheetColumnOn(column: FeatureGatedColumn, features: SheetFeatures): boolean {
  return !column.feature || features[column.feature]
}

/** The columns this store's sheets carry, in order. */
export function sheetColumnsFor<C extends FeatureGatedColumn>(columns: C[], features: SheetFeatures): C[] {
  return columns.filter((column) => isSheetColumnOn(column, features))
}

/** Headers of the columns this store's sheets leave out. */
export function hiddenSheetHeaders(columns: FeatureGatedColumn[], features: SheetFeatures): string[] {
  return columns.filter((column) => !isSheetColumnOn(column, features)).map((column) => column.header)
}

/** A row with exactly `headers`, in order (missing values blank). */
export function pickSheetRow(values: Record<string, unknown>, headers: string[]): Record<string, unknown> {
  return Object.fromEntries(headers.map((header) => [header, values[header] ?? ""]))
}

/** Rows of an export without a fixed column list: drops the keys whose
 *  feature is off (`gated` maps a header to the feature it hangs off). */
export function omitHiddenKeys<R extends Record<string, unknown>>(
  rows: R[],
  gated: Record<string, SheetFeature>,
  features: SheetFeatures,
): R[] {
  const hidden = Object.entries(gated)
    .filter(([, feature]) => !features[feature])
    .map(([header]) => header)
  if (!hidden.length) return rows
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row }
    for (const header of hidden) delete copy[header]
    return copy as R
  })
}

/** An uploaded file's rows with the hidden columns (and their aliases)
 *  removed, so an old file that still has them imports as if they were
 *  blank — the column is ignored, never an error. */
export function stripHiddenSheetColumns(rows: Record<string, unknown>[], hiddenHeaders: string[]): Record<string, unknown>[] {
  if (!hiddenHeaders.length) return rows
  return rows.map((row) => {
    const copy = { ...row }
    for (const header of hiddenHeaders) delete copy[header]
    return copy
  })
}

/** Dropdown lists limited to the columns the sheet carries. */
export function dropdownsFor(dropdowns: Record<string, string[]>, headers: string[]): Record<string, string[]> {
  return Object.fromEntries(Object.entries(dropdowns).filter(([column]) => headers.includes(column)))
}
