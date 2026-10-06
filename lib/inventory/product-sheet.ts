import { ALL_SHEET_FEATURES, sheetColumnsFor, type SheetFeature, type SheetFeatures } from "../sheet-features"

/**
 * The product spreadsheet's columns — one definition shared by the import
 * template, its Instructions sheet and the product export, so all three
 * always carry the same headers in the same order (the Add Product form's
 * order, section by section). importProductsFromExcel reads columns by these
 * header names, so a renamed header here must be renamed there too.
 */
export type ProductSheetColumn = {
  header: string
  /** As shown on the Instructions sheet. */
  required: string
  help: string
  /** The template's example row. */
  example: string | number
  /** Only in this store's sheets while the feature is on (lib/sheet-features.ts). */
  feature?: SheetFeature
}

export const PRODUCT_SHEET_COLUMNS: ProductSheetColumn[] = [
  {
    header: "Product Code",
    required: "No — leave blank",
    help: "Generated automatically from the product's details, in your SKU format (Settings). An export fills it in for reference; the import ignores it and always creates new products.",
    example: "",
  },
  // Basic Information
  {
    header: "Product Name",
    required: "Yes (blank on a follow-on row)",
    help: "Name of the design. Leave it blank on a row to add one more metal and/or stone to the product above (see the notes at the top).",
    example: "Two-tone Ring",
  },
  {
    header: "Metal Type",
    required: "Yes",
    help: "The metal (e.g. Gold, Silver) — or, for a loose-stone product, the stone itself (e.g. Diamond). Must match a name under Settings › Taxonomy (see the dropdown).",
    example: "Gold",
  },
  { header: "Category", required: "Yes", help: "Must match a category under Settings › Taxonomy (see the dropdown).", example: "Ornament" },
  { header: "Category Type", required: "No", help: "The item type within the Category (e.g. Ring). Must belong to that Category.", example: "Ring" },
  {
    header: "Style",
    feature: "style",
    required: "Yes",
    help: "e.g. Ladies, Gents. Must match a style under Settings › Taxonomy (see the dropdown).",
    example: "Ladies",
  },
  {
    header: "Stone Type",
    required: "No",
    help: "Only when Metal Type is a stone: which kind it is (e.g. Natural, Lab-Grown). Must belong to that stone.",
    example: "",
  },
  // Metals
  {
    header: "Purity",
    required: "No",
    help: "One of this metal's purities from Settings › Purity (see the dropdown, e.g. 22K). Older generic labels like \"Gold 22K\" are also accepted.",
    example: "22K",
  },
  { header: "Gross Weight", required: "Yes", help: "Typical gross weight of the design, in grams.", example: 3.2 },
  { header: "Metal GST Rate", feature: "gstRates", required: "No", help: "GST rate for the metal, by its name in Settings › GST Rates (see the dropdown).", example: "" },
  // Stone Pricing
  {
    header: "Has Stone Component",
    required: "No (default No)",
    help: "Yes for a metal piece with an embedded stone. The stone columns (Stone through Stone GST Rate) are only saved when this is Yes and a Stone is given.",
    example: "Yes",
  },
  { header: "Stone Metal Type Name", required: "No", help: "The embedded stone, e.g. Diamond (see the dropdown).", example: "Diamond" },
  {
    header: "Stone Type Names",
    required: "No",
    help: "Kinds of that stone, comma-separated if more than one, e.g. Natural, Lab-Grown.",
    example: "Natural",
  },
  { header: "Carat Weight", required: "No", help: "Stone weight in carats (ct).", example: 0.1 },
  { header: "Stone Rate", required: "No", help: "Price per carat (₹/ct).", example: 50000 },
  { header: "Stone Charge", required: "No", help: "Stone charge amount (₹), or a percentage if Stone Charge Type is Percentage.", example: 5000 },
  { header: "Stone Charge Type", required: "No (default Fixed)", help: "Fixed or Percentage.", example: "Fixed" },
  { header: "Stone Pcs", required: "No", help: "Number of stones (whole number).", example: 6 },
  { header: "Stone Clarity", required: "No", help: "Clarity grade, e.g. FG/VVS-VS (see the dropdown for your list).", example: "VVS" },
  { header: "IGI Certificate No.", required: "No", help: "Stone certificate number.", example: "" },
  { header: "Stone GST Rate", feature: "gstRates", required: "No", help: "GST rate for the stone, by its name in Settings › GST Rates (see the dropdown).", example: "" },
  { header: "Stone Weight", required: "No", help: "Stone weight in grams.", example: 0.02 },
  { header: "Net Weight", required: "Yes", help: "Typical net weight of the design, in grams.", example: 4.27 },
  // Charges
  { header: "Making Charge", required: "No", help: "Making charge amount (₹), or a percentage if Making Charge Type is Percentage.", example: 500 },
  { header: "Making Charge Type", required: "No (default Fixed)", help: "Fixed or Percentage.", example: "Fixed" },
  // Product Details
  { header: "Design Code", required: "No", help: "Your own design reference.", example: "RG-001" },
  { header: "HSN Code", required: "No", help: "HSN code for GST, e.g. 7113.", example: "7113" },
  { header: "Active", required: "No (default Yes)", help: "Yes or No. No creates the product as Inactive.", example: "Yes" },
  {
    header: "Finish",
    required: "No (default Unfinished)",
    help: "Unfinished or Finished / Hallmarked. New stock made from the product starts with this Finish.",
    example: "Unfinished",
  },
  // Additional Information
  { header: "Description", required: "No", help: "Shown on the product.", example: "Gold + silver ladies ring with diamonds and a ruby"},
  { header: "Notes", required: "No", help: "Internal notes.", example: "" },
  // Stock entry
  {
    header: "Stock Quantity",
    required: "No",
    help: "Fill in to also create an opening stock entry with this quantity. Blank = no stock entry. An export leaves it blank.",
    example: "",
  },
  {
    header: "Location",
    feature: "locations",
    required: "No",
    help: "Where that opening stock is kept. Must match a location under Settings › Locations. Blank = your default location.",
    example: "",
  },
]

/** Every header, every feature on (the demo store's layout). */
export const PRODUCT_SHEET_HEADERS = PRODUCT_SHEET_COLUMNS.map((column) => column.header)

/** The columns this store's product sheets carry. */
export function productSheetColumns(features: SheetFeatures = ALL_SHEET_FEATURES) {
  return sheetColumnsFor(PRODUCT_SHEET_COLUMNS, features)
}

export function productSheetHeaders(features: SheetFeatures = ALL_SHEET_FEATURES) {
  return productSheetColumns(features).map((column) => column.header)
}

/** The template's second example row: Product Name blank, so it adds one
 * more metal and one more stone to the "Two-tone Ring" above it. */
export const PRODUCT_SHEET_FOLLOW_ON_EXAMPLE: Record<string, string | number> = {
  "Metal Type": "Silver",
  Purity: "925",
  "Gross Weight": 1.1,
  "Stone Metal Type Name": "Ruby",
  "Carat Weight": 0.05,
  "Stone Rate": 20000,
  "Stone Charge": 1000,
  "Stone Charge Type": "Fixed",
  "Stone Pcs": 2,
}

/** The Instructions sheet's rows. */
export function productSheetInstructions(features: SheetFeatures = ALL_SHEET_FEATURES) {
  return productSheetColumns(features).map((column, index) => ({
    "#": index + 1,
    Column: column.header,
    Required: column.required,
    "What to enter": column.help,
  }))
}
