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
}

export const PRODUCT_SHEET_COLUMNS: ProductSheetColumn[] = [
  {
    header: "Product Code",
    required: "No — leave blank",
    help: "Generated automatically (from Metal, Purity, Style and Type). An export fills it in for reference; the import ignores it and always creates new products.",
    example: "",
  },
  // Basic Information
  { header: "Product Name", required: "Yes", help: "Name of the design.", example: "Classic Gold Ring" },
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
    required: "Yes (when Style is turned on)",
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
  { header: "Purity", required: "No", help: "Pick from the dropdown (e.g. Gold 22K).", example: "Gold 22K" },
  { header: "Gross Weight", required: "Yes", help: "Typical gross weight of the design, in grams.", example: 8.5 },
  // Stone Pricing
  {
    header: "Has Stone Component",
    required: "No (default No)",
    help: "Yes for a metal piece with an embedded stone. The Stone, Stone Types and Stone Rate columns are only saved when this is Yes.",
    example: "No",
  },
  { header: "Stone Metal Type Name", required: "No", help: "The embedded stone, e.g. Diamond (see the dropdown).", example: "" },
  {
    header: "Stone Type Names",
    required: "No",
    help: "Kinds of that stone, comma-separated if more than one, e.g. Natural, Lab-Grown.",
    example: "",
  },
  { header: "Carat Weight", required: "No", help: "Stone weight in carats (ct).", example: "" },
  { header: "Stone Rate", required: "No", help: "Price per carat (₹/ct).", example: "" },
  { header: "Stone Charge", required: "No", help: "Stone charge amount (₹), or a percentage if Stone Charge Type is Percentage.", example: "" },
  { header: "Stone Charge Type", required: "No (default Fixed)", help: "Fixed or Percentage.", example: "Fixed" },
  { header: "Stone Weight", required: "No", help: "Stone weight in grams.", example: "" },
  { header: "Net Weight", required: "Yes", help: "Typical net weight of the design, in grams.", example: 8.2 },
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
  { header: "Description", required: "No", help: "Shown on the product.", example: "22K gold ladies ring" },
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
    required: "No",
    help: "Where that opening stock is kept. Must match a location under Settings › Locations. Blank = your default location.",
    example: "",
  },
]

export const PRODUCT_SHEET_HEADERS = PRODUCT_SHEET_COLUMNS.map((column) => column.header)

/** The Instructions sheet's rows. */
export function productSheetInstructions() {
  return PRODUCT_SHEET_COLUMNS.map((column, index) => ({
    "#": index + 1,
    Column: column.header,
    Required: column.required,
    "What to enter": column.help,
  }))
}
