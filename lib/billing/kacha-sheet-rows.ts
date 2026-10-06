// Estimate (Kacha slip) → spreadsheet rows, shared by the Estimates export
// and the delete-all backup (lib/actions/kacha-invoice-actions.ts). A plain
// module with no DB access of its own, so the e2e suite can build a backup
// workbook exactly as the app does (the real one only ever goes out by email).
import type { Prisma } from "@prisma/client"

import { PURITY_LABELS } from "../purity"
import { formatSheetDate } from "../inventory/stock-sheet"
import { METALS_AND_STONES_COLUMN, describePieceComponentsText } from "../piece-components-text"
import { KACHA_SHEET_HEADERS, KACHA_STATUS_LABELS } from "./kacha-sheet"

/** What the rows below are built from — pass as the findMany `include`. */
export const KACHA_SHEET_INCLUDE = {
  customer: { select: { name: true, phone: true, gstin: true } },
  convertedTo: { select: { invoiceNumber: true } },
  location: { select: { name: true } },
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      metalType: { select: { name: true } },
      vendor: { select: { name: true } },
      inventoryStock: { select: { vendor: { select: { name: true } } } },
      components: { orderBy: { sortOrder: "asc" }, include: { metalType: { select: { name: true } } } },
    },
  },
} satisfies Prisma.KachaInvoiceInclude

export type KachaSheetSlip = Prisma.KachaInvoiceGetPayload<{ include: typeof KACHA_SHEET_INCLUDE }>

/**
 * One row per line item, in the import template's columns and value forms
 * (labels, plain numbers, DD/MM/YYYY), so the file imports back. Slip-level
 * values are written on each slip's first row only — the import reads them
 * from there; Slip Ref, Date and Party Name repeat for readability.
 */
export function kachaSheetRows(slips: KachaSheetSlip[]): Record<string, unknown>[] {
  const num = (value: { toString(): string } | null | undefined) => (value == null ? "" : Number(value))
  return slips.flatMap((slip) =>
    slip.items.map((item, index) => {
      const first = index === 0
      const values: Record<string, unknown> = {
        "Slip Ref": slip.slipNumber,
        Date: formatSheetDate(slip.invoiceDate),
        "Party Name": slip.customer?.name ?? "",
        ...(first
          ? {
              "Party Phone": slip.customer?.phone ?? "",
              "Party GSTIN": slip.customer?.gstin ?? "",
              Location: slip.location?.name ?? "",
              Discount: Number(slip.discount),
              "Paid Amount": Number(slip.paidAmount),
              Notes: slip.notes ?? "",
              "Converted To Invoice #": slip.convertedTo?.invoiceNumber ?? "",
              Status: KACHA_STATUS_LABELS[slip.status] ?? slip.status,
              Total: Number(slip.totalAmount),
              Balance: Number(slip.balanceAmount),
            }
          : {}),
        "Item Name": item.itemName,
        // A stock-linked line has no party of its own — its stock's vendor.
        "Purchased From": item.vendor?.name ?? item.vendorName ?? item.inventoryStock?.vendor?.name ?? "",
        Metal: item.metalType?.name ?? "",
        Purity: item.purityLabel ?? (item.purity ? PURITY_LABELS[item.purity] : ""),
        Quantity: item.quantity,
        "Gross Weight": num(item.grossWeight),
        "Stone Weight": num(item.stoneWeight),
        "DMO Weight": num(item.dmoWeight),
        "Net Weight": num(item.netWeight),
        Rate: num(item.rate),
        "Making Charge": Number(item.makingCharge),
        "Making Charge Type": item.makingChargeType === "PERCENTAGE" ? "Percentage" : "Fixed",
        "HM Charge": Number(item.hmCharge),
        Stone: item.stoneMetalTypeName ?? "",
        "Stone Type": item.stoneTypeNames ?? "",
        "Carat Weight": num(item.caratWeight),
        "Stone Rate": num(item.stoneRate),
        "Stone Charge": Number(item.stoneCharge),
        "Fine Weight": num(item.fineWeight),
        "Line Total": Number(item.lineTotal),
        [METALS_AND_STONES_COLUMN]: describePieceComponentsText(item.components),
      }
      return Object.fromEntries(KACHA_SHEET_HEADERS.map((header) => [header, values[header] ?? ""]))
    }),
  )
}

/** Sheet names of the delete-all backup; a workbook with both is restored. */
export const KACHA_BACKUP_SLIPS_SHEET = "Estimates"
export const KACHA_BACKUP_ITEMS_SHEET = "Estimate Items"

/**
 * The delete-all backup's sheets: a per-slip summary ("Estimates", for
 * reading) and the line items in the import template's own columns
 * ("Estimate Items" — what a restore reads, so it brings back everything the
 * import can recreate: slip number, party, location, weights incl. DMO, HM
 * and stone details, Purchased From, payments, notes, Tax Invoice link).
 */
export function kachaBackupSheets(slips: KachaSheetSlip[]) {
  const slipRows = slips.map((slip, index) => ({
    "Sr. No.": index + 1,
    "Slip #": slip.slipNumber,
    Date: formatSheetDate(slip.invoiceDate),
    Party: slip.customer?.name || "",
    "Party Phone": slip.customer?.phone || "",
    "Party GSTIN": slip.customer?.gstin || "",
    Location: slip.location?.name || "",
    Status: KACHA_STATUS_LABELS[slip.status] ?? slip.status,
    Subtotal: Number(slip.subtotal),
    "Making Charges": Number(slip.makingCharges),
    "Stone Charges": Number(slip.stoneCharges),
    Discount: Number(slip.discount),
    Total: Number(slip.totalAmount),
    Paid: Number(slip.paidAmount),
    Balance: Number(slip.balanceAmount),
    "Converted To Invoice": slip.convertedTo?.invoiceNumber || "",
    Notes: slip.notes || "",
  }))

  return [
    { name: KACHA_BACKUP_SLIPS_SHEET, rows: slipRows },
    { name: KACHA_BACKUP_ITEMS_SHEET, rows: kachaSheetRows(slips), columns: KACHA_SHEET_HEADERS },
  ]
}
