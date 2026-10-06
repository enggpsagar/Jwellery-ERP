/**
 * The Party spreadsheet's columns — one definition shared by the Party import
 * template, its Instructions sheet and the Party export, so all three carry
 * the same headers in the same order (Party Name first, then the Add Party
 * form's order) and an exported file imports back cleanly.
 * importCustomersFromExcel reads columns by these header names; the export
 * appends the read-only PARTY_SHEET_EXPORT_ONLY_HEADERS after them, which
 * the import ignores.
 */
export type PartySheetColumn = {
  header: string
  /** As shown on the Instructions sheet. */
  required: string
  help: string
  /** The template's example row. */
  example: string | number
}

export const PARTY_SHEET_COLUMNS: PartySheetColumn[] = [
  { header: "Party Name", required: "Yes", help: "The party's name.", example: "Walk-in Customer" },
  {
    header: "GST Type",
    required: "No (default from your GST scheme)",
    help: "Not GST Registered, Regular or Composition Scheme (see the dropdown). Blank = your store's default for new parties (Settings › GST scheme: Regular for a Wholesaler & Manufacturer store, otherwise Not GST Registered). Any other value is an error.",
    example: "Not GST Registered",
  },
  {
    header: "GST Number",
    required: "When GST Type is Regular or Composition Scheme",
    help: "The 15-character GSTIN, e.g. 27ABCDE1234F1Z5. Required for a Regular or Composition Scheme party (unless your own store is on the Composition scheme).",
    example: "",
  },
  { header: "Phone", required: "No", help: "Must not already belong to another party, or appear twice in the file.", example: "9876543210" },
  { header: "Alternate Phone", required: "No", help: "A second number.", example: "" },
  { header: "Email", required: "No", help: "A valid email address, e.g. name@example.com.", example: "customer@example.com" },
  { header: "Address", required: "No", help: "Full address.", example: "123 MG Road" },
  { header: "Notes", required: "No", help: "Anything worth remembering.", example: "" },
  {
    header: "State",
    required: "No (required if City is given)",
    help: "One of the states in the dropdown (case doesn't matter).",
    example: "Maharashtra",
  },
  {
    header: "City",
    required: "No",
    help: "A city of that State, as offered by the Add Party form's City list (case doesn't matter).",
    example: "Mumbai",
  },
  { header: "Pincode", required: "No", help: "6 digits, e.g. 400001.", example: "400001" },
  { header: "PAN Number", required: "No", help: "10 characters, e.g. ABCDE1234F.", example: "" },
  { header: "Aadhaar Number", required: "No", help: "12 digits.", example: "" },
  { header: "Registration Id", required: "No", help: "Registration / Encircle Id.", example: "" },
  {
    header: "Opening Balance",
    required: "No (default 0)",
    help: "A plain number in ₹ (no currency sign or commas). Positive = the party owes you.",
    example: 0,
  },
]

export const PARTY_SHEET_HEADERS = PARTY_SHEET_COLUMNS.map((column) => column.header)

/** Written by the export after the shared columns, for reference only — the
 *  import ignores them (they're computed from the party's history). */
export const PARTY_SHEET_EXPORT_ONLY_HEADERS = [
  "Current Balance",
  "Balance Type",
  "Total Orders",
  "Total Purchase Value",
  "Pending Amount",
  "Last Purchase Date",
  "Last Payment Date",
  "Created At",
]

export const PARTY_SHEET_NOTES = [
  "How to fill in the Parties sheet",
  "• One row per party. Replace or delete the example row before importing.",
  "• Columns can be in any order — they are matched by header name, so don't rename the headers.",
  "• An exported Parties file has the same columns plus read-only ones at the end (Current Balance, Total Orders, …) — the import ignores those.",
  "• Every row adds a new party; a Phone that already belongs to a party is an error.",
  "• Dropdowns list the GST types and states. The Options sheet shows every list.",
  "• Nothing is imported if any row has an error — the import lists each problem with its row number.",
]

/** The Instructions sheet's column table. */
export function partySheetInstructions() {
  return [
    ...PARTY_SHEET_COLUMNS.map((column, index) => ({
      "#": index + 1,
      Column: column.header,
      Required: column.required,
      "What to enter": column.help,
    })),
    ...PARTY_SHEET_EXPORT_ONLY_HEADERS.map((header, index) => ({
      "#": PARTY_SHEET_COLUMNS.length + index + 1,
      Column: header,
      Required: "Export only",
      "What to enter": "Filled in by the export for reference; ignored on import.",
    })),
  ]
}
