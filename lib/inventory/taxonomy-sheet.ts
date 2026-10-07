/**
 * The Settings › Metals & Categories / Stones & Stone Types spreadsheets —
 * one definition shared by each import template, its Instructions sheet and
 * the matching export, so an exported file imports back unchanged. The
 * imports (importMetalsAndCategoriesFromExcel / importStonesAndStoneTypesFromExcel
 * in lib/actions/taxonomy-actions.ts) read sheets and columns by these names.
 *
 * Selling prices live on a Purity (metals) or a Stone Type (stones), the same
 * as the Settings form — a Metal/Stone row has no Selling Price column.
 */
export type TaxonomySheetColumn = {
  header: string
  required: string
  help: string
  example: string | number
}

export type TaxonomySheet = {
  name: string
  columns: TaxonomySheetColumn[]
  /** The template's example rows. */
  examples: Record<string, string | number>[]
}

export const UNIT_LABELS = { GRAM: "Gram", CARAT: "Carat" } as const

export function parseUnitLabel(raw: string): "GRAM" | "CARAT" | null {
  const value = raw.trim().toLowerCase()
  if (value === "gram" || value === "grams" || value === "g") return "GRAM"
  if (value === "carat" || value === "carats" || value === "ct") return "CARAT"
  return null
}

/** Yes / No / blank (null). Anything else is `undefined` — an error. */
export function parseYesNo(raw: string): boolean | null | undefined {
  const value = raw.trim().toLowerCase()
  if (!value) return null
  if (value === "yes" || value === "true" || value === "y") return true
  if (value === "no" || value === "false" || value === "n") return false
  return undefined
}

export const yesNo = (value: boolean) => (value ? "Yes" : "No")

const BLANK_KEEPS = "Blank on a row that already exists keeps what is saved."

export const METALS_SHEET: TaxonomySheet = {
  name: "Metals",
  columns: [
    { header: "Name", required: "Yes", help: "Metal name, e.g. Gold. A name that already exists under Metals updates that metal; one that exists under Stones is rejected (metals and stones share one list of names).", example: "Gold" },
    { header: "Has Purity", required: "No (default Yes)", help: `Yes if the metal is bought and sold by purity (22K, 925, ...) — then list its purities on the Purities sheet. ${BLANK_KEEPS}`, example: "Yes" },
    { header: "Primary Unit", required: "No (default Gram)", help: `Gram or Carat — the unit its weights are kept in. ${BLANK_KEEPS}`, example: "Gram" },
  ],
  examples: [{ Name: "Gold", "Has Purity": "Yes", "Primary Unit": "Gram" }],
}

export const PURITIES_SHEET: TaxonomySheet = {
  name: "Purities",
  columns: [
    { header: "Metal", required: "Yes", help: "A metal with Has Purity = Yes — already in Settings or on the Metals sheet of this file.", example: "Gold" },
    { header: "Label", required: "Yes", help: "Purity label, e.g. 22K or 925 (up to 40 characters). An existing label under the same metal updates that purity.", example: "22K" },
    { header: "SKU Code", required: "Yes for a new purity", help: "Short code used in product codes, e.g. G22 (up to 20 characters).", example: "G22" },
    { header: "Fineness %", required: "No", help: "Pure-metal content, more than 0 and up to 100 (22K = 91.6). Blank on a new purity is worked out from the label (22K → 91.6, 925 → 92.5).", example: 91.6 },
    { header: "Selling Price", required: "No", help: `Your selling rate per gram (per the metal's Primary Unit) for this purity, a plain number. ${BLANK_KEEPS} Every change is logged in the selling-rate history.`, example: 6800 },
    { header: "Hallmarkable", required: "No (default No)", help: `Yes if pieces of this purity get a hallmark charge. ${BLANK_KEEPS}`, example: "Yes" },
    { header: "Wastage %", required: "No", help: `Default wastage / touch % copied onto new sale and purchase lines of this purity, 0 to 100 (0 = none). ${BLANK_KEEPS}`, example: 2 },
  ],
  examples: [
    { Metal: "Gold", Label: "22K", "SKU Code": "G22", "Fineness %": 91.6, "Selling Price": 6800, Hallmarkable: "Yes", "Wastage %": 2 },
    { Metal: "Gold", Label: "18K", "SKU Code": "G18", "Fineness %": 75, "Selling Price": "", Hallmarkable: "Yes", "Wastage %": "" },
  ],
}

export const CATEGORIES_SHEET: TaxonomySheet = {
  name: "Categories",
  columns: [
    { header: "Category Name", required: "Yes", help: "Category, e.g. Ring. An existing category gets any listed types it doesn't have yet.", example: "Ring" },
    { header: "Category Types", required: "No", help: "Its types, comma-separated, e.g. Casting, Handmade.", example: "Casting, Handmade" },
  ],
  examples: [{ "Category Name": "Ring", "Category Types": "Casting, Handmade" }],
}

export const STONES_SHEET: TaxonomySheet = {
  name: "Stones",
  columns: [
    { header: "Name", required: "Yes", help: "Stone name, e.g. Diamond. A name that already exists under Stones updates that stone; one that exists under Metals is rejected (metals and stones share one list of names).", example: "Diamond" },
    { header: "Primary Unit", required: "No (default Carat)", help: `Carat or Gram — the unit its weights are kept in. ${BLANK_KEEPS}`, example: "Carat" },
  ],
  examples: [{ Name: "Diamond", "Primary Unit": "Carat" }],
}

export const STONE_TYPES_SHEET: TaxonomySheet = {
  name: "Stone Types",
  columns: [
    { header: "Stone Name", required: "Yes", help: "A stone already in Settings or on the Stones sheet of this file.", example: "Diamond" },
    { header: "Type Name", required: "Yes", help: "e.g. Natural, Lab-Grown (up to 60 characters). An existing type under the same stone updates it.", example: "Natural" },
    { header: "Selling Price", required: "No", help: `Your selling rate per carat (per the stone's Primary Unit) for this type, a plain number. ${BLANK_KEEPS} Every change is logged in the selling-rate history.`, example: 50000 },
    { header: "Grams per Carat", required: "No (default 0.2)", help: `Carat-to-gram conversion for this type, more than 0. ${BLANK_KEEPS}`, example: 0.2 },
  ],
  examples: [{ "Stone Name": "Diamond", "Type Name": "Natural", "Selling Price": 50000, "Grams per Carat": 0.2 }],
}

export const METAL_FILE_SHEETS = [METALS_SHEET, PURITIES_SHEET, CATEGORIES_SHEET]
export const STONE_FILE_SHEETS = [STONES_SHEET, STONE_TYPES_SHEET]

export const sheetHeaders = (sheet: TaxonomySheet) => sheet.columns.map((column) => column.header)

export const METAL_FILE_NOTES = [
  "Metals, Purities and Categories — fill in any of the three sheets (leave a sheet empty to skip it).",
  "An exported file imports back as-is: rows whose name already exists are updated, new names are added. Nothing is ever deleted or turned off.",
  "Selling prices are per Purity (Purities sheet), not per Metal — the same as Settings.",
  "All-or-nothing: if any row has a problem, nothing is imported and every problem is listed.",
]

export const STONE_FILE_NOTES = [
  "Stones and Stone Types — fill in either sheet (leave one empty to skip it).",
  "An exported file imports back as-is: rows whose name already exists are updated, new names are added. Nothing is ever deleted or turned off.",
  "Selling prices are per Stone Type (Stone Types sheet), not per Stone — the same as Settings.",
  "All-or-nothing: if any row has a problem, nothing is imported and every problem is listed.",
]

/** The Instructions sheet's rows for a file's sheets. */
export function taxonomySheetInstructions(sheets: TaxonomySheet[]) {
  return sheets.flatMap((sheet) =>
    sheet.columns.map((column) => ({
      Sheet: sheet.name,
      Column: column.header,
      Required: column.required,
      "What to enter": column.help,
    })),
  )
}
