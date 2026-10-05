/**
 * What a printed stock tag shows — Settings > Tags picks these per layout
 * (QR tag, Barcode tag), stored on BusinessSettings.qrTagFields /
 * barcodeTagFields in display order. The QR code itself always holds the
 * piece's scan link (`/s/<id>`, scan-to-sell) and the barcode always holds
 * the tag code — these fields are the printed text beside them.
 */

export const STOCK_TAG_FIELDS = [
  { key: "STORE_NAME", label: "Store name" },
  { key: "TAG_CODE", label: "Tag / stock code" },
  { key: "PRODUCT_NAME", label: "Product name" },
  { key: "PRODUCT_CODE", label: "Product code (SKU)" },
  { key: "CATEGORY", label: "Category & type" },
  { key: "METALS", label: "Metals & purity (every metal, e.g. Gold 18K, Silver 925)" },
  { key: "METAL_WEIGHTS", label: "Weight of each metal" },
  { key: "GROSS_WEIGHT", label: "Gross weight" },
  { key: "NET_WEIGHT", label: "Net weight" },
  { key: "STONES", label: "Stones (each stone: name, type, carat, pieces)" },
  { key: "STONE_CLARITY", label: "Stone clarity & certificate no." },
  { key: "STONE_TOTAL", label: "Total stone weight & pieces" },
  { key: "MFG_DATE", label: "Manufacture date" },
] as const

export type StockTagField = (typeof STOCK_TAG_FIELDS)[number]["key"]

const KEYS = new Set<string>(STOCK_TAG_FIELDS.map((field) => field.key))

/** Matches the schema defaults — what a store that never opened Settings > Tags prints. */
export const DEFAULT_QR_TAG_FIELDS: StockTagField[] = [
  "TAG_CODE",
  "PRODUCT_NAME",
  "PRODUCT_CODE",
  "METALS",
  "GROSS_WEIGHT",
  "NET_WEIGHT",
  "STONES",
  "MFG_DATE",
]

export const DEFAULT_BARCODE_TAG_FIELDS: StockTagField[] = [
  "STORE_NAME",
  "TAG_CODE",
  "METALS",
  "GROSS_WEIGHT",
  "NET_WEIGHT",
  "STONES",
]

/** Drops unknown/duplicate keys (a field removed in a later version). */
export function normalizeTagFields(values: readonly string[] | null | undefined, fallback: StockTagField[]) {
  if (!values) return fallback
  return Array.from(new Set(values.filter((value) => KEYS.has(value)))) as StockTagField[]
}
