/**
 * The artisan (karigar) spreadsheet's columns — one definition shared by the
 * import template, its Instructions sheet and the artisan export, so all
 * three carry the same headers in the same order with the same value forms
 * (labels, Yes/No, plain numbers). importKarigarsFromExcel reads columns by
 * these header names (or an alias, for files made before the layout was
 * shared), so a renamed header here must keep its old name as an alias.
 *
 * Client-safe: no DB access here.
 */
export type KarigarSheetColumn = {
  header: string
  /** Older header names the import still accepts. */
  aliases?: string[]
  /** As shown on the Instructions sheet. */
  required: string
  help: string
  /** The template's example row. */
  example: string | number
}

export const KARIGAR_SHEET_COLUMNS: KarigarSheetColumn[] = [
  { header: "Name", required: "Yes", help: "The artisan's name.", example: "Ramesh Sonar" },
  {
    header: "Mobile",
    required: "No",
    help: "Doubles as the artisan's login later, so it must be unique: not used by another artisan, another row in the file, or any user's login.",
    example: "",
  },
  { header: "WhatsApp", required: "No", help: "WhatsApp number.", example: "" },
  {
    header: "Email",
    required: "No",
    help: "Must not already be another user's login, or appear on another row.",
    example: "",
  },
  { header: "Address", required: "No", help: "Street address.", example: "" },
  { header: "City", required: "No", help: "City.", example: "Mumbai" },
  { header: "State", required: "No", help: "State name (see the dropdown).", example: "Maharashtra" },
  { header: "Pincode", required: "No", help: "Postal code.", example: "400001" },
  {
    header: "GST Number",
    aliases: ["GSTIN"],
    required: "When GST Type is Regular or Composition",
    help: "The artisan's GSTIN. Required for a registered artisan (not when your own store is on the Composition scheme).",
    example: "",
  },
  {
    header: "GST Type",
    required: "No (default Not GST Registered)",
    help: "Not GST Registered, Regular or Composition (see the dropdown).",
    example: "Not GST Registered",
  },
  { header: "PAN Number", required: "No", help: "10-character PAN, e.g. ABCDE1234F.", example: "" },
  { header: "Aadhaar Number", required: "No", help: "12-digit Aadhaar number.", example: "" },
  { header: "Specialization", required: "No", help: "Craft description, e.g. Chain making.", example: "Chain making" },
  {
    header: "Metal Type",
    required: "No",
    help: "The metal this artisan mainly works with. Must match a name under Settings › Taxonomy (see the dropdown).",
    example: "Gold",
  },
  {
    header: "Assigned Metals/Stones",
    required: "No",
    help: "Metals/stones the artisan may be issued, comma-separated, e.g. Gold, Silver. Each must match a name under Settings › Taxonomy.",
    example: "Gold, Silver",
  },
  {
    header: "Location",
    required: "When you only have access to some locations",
    help: "Must match one of your locations under Settings › Locations (see the dropdown). Blank = no location — or, if your access is limited to one location, that location.",
    example: "",
  },
  {
    header: "Opening Gold (g)",
    aliases: ["Opening Gold"],
    required: "No (default 0)",
    help: "Fine gold (grams) the artisan already held before using this app. A plain number.",
    example: 0,
  },
  {
    header: "Opening Cash",
    required: "No (default 0)",
    help: "Labour charges (₹) already owed to the artisan. A plain number, e.g. 1000.",
    example: 0,
  },
  { header: "Notes", required: "No", help: "Internal notes.", example: "" },
  {
    header: "Active",
    aliases: ["Status"],
    required: "No (default Yes)",
    help: "Yes or No. No adds the artisan as Disabled.",
    example: "Yes",
  },
]

export const KARIGAR_SHEET_HEADERS = KARIGAR_SHEET_COLUMNS.map((column) => column.header)

/** Read-only columns an export adds around the sheet columns; the import
 *  ignores them (codes are always generated). */
export const KARIGAR_EXPORT_LEADING_HEADERS = ["Sr No", "Artisan Code"]
export const KARIGAR_EXPORT_TRAILING_HEADERS = ["Created At"]
export const KARIGAR_EXPORT_HEADERS = [
  ...KARIGAR_EXPORT_LEADING_HEADERS,
  ...KARIGAR_SHEET_HEADERS,
  ...KARIGAR_EXPORT_TRAILING_HEADERS,
]

export const KARIGAR_SHEET_NOTES = [
  "How to fill in the Artisans sheet",
  "• One row per artisan. Replace or delete the example row before importing.",
  "• Columns can be in any order — they are matched by their header names, so don't rename the headers.",
  "• Dropdowns list your store's own names (from Settings). The Options sheet shows every list.",
  "• Artisan codes are generated automatically. No login is created for a Mobile/Email — add one later by editing the artisan.",
  "• Nothing is imported if any row has an error — the import lists each problem with its row number.",
  "• An Artisans export has these same columns (plus Sr No, Artisan Code and Created At, which the import ignores), so an exported file can be edited and imported as new artisans.",
]

/** The Instructions sheet's rows. */
export function karigarSheetInstructions() {
  return KARIGAR_SHEET_COLUMNS.map((column, index) => ({
    "#": index + 1,
    Column: column.header,
    Required: column.required,
    "What to enter": column.help,
  }))
}

/** A cell by its header, falling back to the column's older names. */
export function karigarSheetCell(row: Record<string, unknown>, header: string): string {
  const column = KARIGAR_SHEET_COLUMNS.find((c) => c.header === header)
  for (const key of [header, ...(column?.aliases ?? [])]) {
    const value = String(row[key] ?? "").trim()
    if (value) return value
  }
  return ""
}

/** A plain number cell; tolerates "₹ 1,000"-style formatting from older
 *  exports. Blank → 0, anything else unparsable → null. */
export function parseKarigarSheetNumber(raw: string): number | null {
  const cleaned = raw.replace(/₹|rs\.?|,|\s/gi, "")
  if (cleaned === "") return 0
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** Yes/No (also Active/Inactive, True/False). Blank → fallback, unknown → null. */
export function parseKarigarSheetYesNo(raw: string, fallback: boolean): boolean | null {
  const value = raw.trim().toLowerCase()
  if (value === "") return fallback
  if (["yes", "y", "true", "active"].includes(value)) return true
  if (["no", "n", "false", "inactive", "disabled"].includes(value)) return false
  return null
}

/** Payment method enum → the label the ledger pages show. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}
