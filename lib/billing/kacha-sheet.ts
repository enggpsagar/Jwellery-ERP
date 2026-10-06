import type { InvoiceStatus, PaymentMethod } from "@prisma/client"

/**
 * The Estimate (Kacha slip) spreadsheet's columns — one definition shared by
 * the import template, its Instructions sheet, the Estimates export and the
 * delete-all backup's line-item sheet, so an exported or backed-up file
 * imports back as-is. One row per line item; rows sharing a Slip Ref are one
 * slip, and slip-level values (party, date, discount, payments, notes) are
 * read from the slip's first row. importKachaInvoicesFromExcel reads columns
 * by these header names. Pure data — safe for client and e2e imports.
 */
export type KachaSheetColumn = {
  header: string
  required: string
  help: string
  example: string | number
}

export const KACHA_SHEET_COLUMNS: KachaSheetColumn[] = [
  // The slip
  {
    header: "Slip Ref",
    required: "Yes, to put several items on one slip",
    help: "Rows with the same Slip Ref become one Estimate. An export/backup fills in the slip number; importing keeps that number when it is free (e.g. restoring a deleted slip), otherwise the next number is used. Any other text (e.g. A1) just groups rows. Blank = the row is its own Estimate.",
    example: "A1",
  },
  { header: "Date", required: "No (default today)", help: "DD/MM/YYYY (or an Excel date).", example: "" },
  {
    header: "Party Name",
    required: "Yes (or Party Phone / GSTIN)",
    help: "An existing party (see the dropdown). Matched on Party Phone first, then Party GSTIN, then name. Parties are never created by the import.",
    example: "",
  },
  { header: "Party Phone", required: "No", help: "The party's phone number, if you'd rather match on it.", example: "" },
  { header: "Party GSTIN", required: "No", help: "The party's GSTIN, if you'd rather match on it.", example: "" },
  {
    header: "Location",
    required: "No (yes if you have access to several locations)",
    help: "A location under Settings › Locations (see the dropdown). Blank = none, or your only location if your access is limited to one.",
    example: "",
  },
  // The line item
  { header: "Item Name", required: "Yes", help: "What was sold.", example: "Gold Chain" },
  {
    header: "Purchased From",
    required: "Yes",
    help: "The party the piece (and its metal) came from — required on every line, as on the New Estimate form. An existing party name (see the dropdown).",
    example: "",
  },
  { header: "Metal", required: "No", help: "A metal under Settings › Taxonomy (see the dropdown).", example: "Gold" },
  {
    header: "Purity",
    required: "No",
    help: "One of this metal's purities from Settings › Purity (see the dropdown, e.g. 22K). Older labels like \"Gold 22K\" are also accepted.",
    example: "22K",
  },
  { header: "Quantity", required: "No (default 1)", help: "Number of pieces (whole number).", example: 1 },
  {
    header: "Gross Weight",
    required: "No",
    help: "Per piece, in the metal's unit (grams; carats for a gemstone metal).",
    example: 10.5,
  },
  { header: "Stone Weight", required: "No", help: "Net stone weight per piece, same unit as Gross Weight.", example: 0 },
  { header: "DMO Weight", required: "No", help: "DMO (deduction) weight per piece, same unit as Gross Weight.", example: 0.3 },
  {
    header: "Net Weight",
    required: "No",
    help: "Per piece. Blank = Gross − Stone − DMO weight, as the form works it out.",
    example: 10.2,
  },
  { header: "Rate", required: "No", help: "Rate per gram (per carat for a Diamond purity) (₹).", example: 6200 },
  { header: "Making Charge", required: "No", help: "Making charge amount for the line (₹).", example: 1500 },
  { header: "Making Charge Type", required: "No (default Fixed)", help: "Fixed or Percentage (as chosen on the form; the amount is still ₹).", example: "Fixed" },
  {
    header: "HM Charge",
    required: "No",
    help: "Hallmarking charge (₹). Blank = your Settings hallmark charge for a hallmarkable purity, as the form fills it in; 0 = none.",
    example: "",
  },
  { header: "Stone", required: "No", help: "An embedded stone, by its name under Settings › Taxonomy (e.g. Diamond).", example: "" },
  { header: "Stone Type", required: "No", help: "Kinds of that stone, comma-separated, e.g. Natural.", example: "" },
  { header: "Carat Weight", required: "No", help: "Stone weight in carats (ct).", example: "" },
  { header: "Stone Rate", required: "No", help: "Price per carat (₹/ct).", example: "" },
  { header: "Stone Charge", required: "No", help: "Stone charge (₹). Blank = Carat Weight × Stone Rate.", example: "" },
  // Slip totals and payment (first row of the slip)
  { header: "Discount", required: "No", help: "Discount on the whole slip (₹).", example: 0 },
  {
    header: "Paid Amount",
    required: "No",
    help: "Paid now (₹), against the whole slip. Blank or 0 = fully on credit. Can't exceed the slip total.",
    example: 0,
  },
  {
    header: "Payment Method",
    required: "No (default Cash)",
    help: "Cash, UPI, Net Banking, Cheque, Card or Other.",
    example: "",
  },
  { header: "Payment Reference", required: "No", help: "UTR / cheque number etc.", example: "" },
  { header: "Paid Amount 2", required: "No", help: "A second payment, paid by another method (₹).", example: "" },
  { header: "Payment Method 2", required: "No (default Cash)", help: "Method of the second payment.", example: "" },
  { header: "Payment Reference 2", required: "No", help: "Reference of the second payment.", example: "" },
  { header: "Notes", required: "No", help: "Notes on the slip.", example: "" },
  // Export-only reference columns
  {
    header: "Converted To Invoice #",
    required: "No — export / backup",
    help: "The Tax Invoice the Estimate was converted to. When restoring, the Estimate is linked back to it if that invoice still exists and isn't linked to another Estimate.",
    example: "",
  },
  { header: "Status", required: "No — export only", help: "Worked out from the payments. Ignored on import.", example: "" },
  { header: "Fine Weight", required: "No — export only", help: "Pure (24K) equivalent of Net Weight. Ignored on import.", example: "" },
  { header: "Line Total", required: "No — export only", help: "Ignored on import (worked out again).", example: "" },
  { header: "Total", required: "No — export only", help: "Slip total. Ignored on import (worked out again).", example: "" },
  { header: "Balance", required: "No — export only", help: "Slip balance. Ignored on import.", example: "" },
  {
    header: "Metals & Stones",
    required: "No — export only",
    help: "A piece of several metals/stones: its rows. Not imported — such a line comes back as one metal line with the same totals.",
    example: "",
  },
]

export const KACHA_SHEET_HEADERS = KACHA_SHEET_COLUMNS.map((column) => column.header)

/** Read from a slip's first row only. */
export const KACHA_SLIP_LEVEL_HEADERS = [
  "Date",
  "Party Name",
  "Party Phone",
  "Party GSTIN",
  "Location",
  "Discount",
  "Paid Amount",
  "Payment Method",
  "Payment Reference",
  "Paid Amount 2",
  "Payment Method 2",
  "Payment Reference 2",
  "Notes",
  "Converted To Invoice #",
  "Status",
  "Total",
  "Balance",
]

export const KACHA_SHEET_NOTES = [
  "How to fill in the Estimates sheet",
  "• One row per line item. Rows with the same Slip Ref become one Estimate; the party, date, location, discount, payments and notes are read from its first row.",
  "• Replace or delete the example row before importing.",
  "• Parties (Party Name and Purchased From) must already exist — the import never creates them.",
  "• Columns can be in any order — they are matched by header name, so don't rename the headers. Columns marked \"export only\" are ignored.",
  "• Dropdowns list your store's own parties, metals, purities, locations and options. The Options sheet shows every list.",
  "• Nothing is imported if any row has an error — the import lists each problem with its row number.",
  "• Each Estimate is posted to the party's ledger like the New Estimate form (the sale, and any payment made now).",
  "• Not covered by the sheet: linking a line to stock, multi-metal pieces and customer exchange (old gold) — use the form for those.",
]

export function kachaSheetInstructions() {
  return KACHA_SHEET_COLUMNS.map((column, index) => ({
    "#": index + 1,
    Column: column.header,
    Required: column.required,
    "What to enter": column.help,
  }))
}

export const KACHA_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  PAID: "Paid",
  PARTIAL: "Partially Paid",
  CANCELLED: "Cancelled",
}

export const KACHA_PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

/** A payment method from its label or enum value; blank = Cash. */
export function parsePaymentMethodCell(raw: string): PaymentMethod | null {
  const value = raw.trim().toLowerCase().replace(/[_\s]+/g, " ")
  if (!value) return "CASH"
  const match = (Object.entries(KACHA_PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).find(
    ([method, label]) => label.toLowerCase() === value || method.toLowerCase().replace(/_/g, " ") === value,
  )
  return match ? match[0] : null
}
