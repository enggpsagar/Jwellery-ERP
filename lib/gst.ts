import type { GstScheme } from "@prisma/client"

/**
 * Single source of truth for GST calculation and display rules across
 * Billing, Quotations, and Purchases. See GstScheme's own doc comment in
 * schema.prisma for the legal reasoning behind each scheme's behavior.
 */

export const GST_SCHEME_OPTIONS: { value: GstScheme; label: string; description: string }[] = [
  {
    value: "REGULAR_B2C",
    label: "Retailer (B2C)",
    description: "Selling to end consumers. Full GST charged and shown on every invoice. Customer GSTIN is optional.",
  },
  {
    value: "REGULAR_B2B",
    label: "Wholesaler & Manufacturer (B2B)",
    description:
      "Selling to other GST-registered businesses. Full GST charged and shown, same as B2C, but the buyer's GSTIN is required for a valid tax invoice.",
  },
  {
    value: "COMPOSITION",
    label: "Small Local Jeweler (Composition Scheme)",
    description:
      "Simplified scheme for small businesses under the turnover threshold. GST can never be shown or collected as a line item on any document - documents print as a Bill of Supply with the mandatory disclaimer instead of a Tax Invoice, and purchases are never eligible for input tax credit.",
  },
]

export function gstSchemeLabel(scheme: GstScheme): string {
  return GST_SCHEME_OPTIONS.find((o) => o.value === scheme)?.label ?? scheme
}

/** Only a B2B (wholesaler/manufacturer) sale legally requires the buyer's
 *  GSTIN for a valid tax invoice - B2C is a consumer sale (GSTIN optional),
 *  and Composition dealers issue a Bill of Supply, not a tax invoice, so the
 *  concept doesn't apply the same way there either. */
export function customerGstinRequired(scheme: GstScheme): boolean {
  return scheme === "REGULAR_B2B"
}

/** A Composition dealer is legally barred from claiming input tax credit on
 *  anything, regardless of what GST a vendor charged on a purchase. */
export function isItcEligible(scheme: GstScheme): boolean {
  return scheme !== "COMPOSITION"
}

/** "Tax Invoice" is the correct heading for a GST-charging document; a
 *  Composition dealer's document is legally a "Bill of Supply" instead. */
export function documentHeading(scheme: GstScheme): string {
  return scheme === "COMPOSITION" ? "Bill of Supply" : "Tax Invoice"
}

/** The mandatory disclaimer text a Composition dealer must print on every
 *  outward document, per GST law - not optional, not editable. */
export const COMPOSITION_DISCLAIMER = "Composition taxable person, not eligible to collect tax on supplies."

export type GstBreakdown = {
  sgst: number
  cgst: number
  igst: number
  isInterState: boolean
}

function normalizeState(state: string): string {
  return state.trim().toLowerCase()
}

/**
 * Computes the GST split for one taxable value, given the store's own
 * scheme and the two parties' states.
 *
 * - COMPOSITION: always zero on all three components, unconditionally - see
 *   GstScheme's doc comment for why this isn't just a UI default, it's a
 *   legal requirement.
 * - REGULAR_B2C / REGULAR_B2B: identical tax-split behavior - the schemes
 *   differ in whether the buyer's GSTIN is mandatory (see
 *   customerGstinRequired above), not in how the tax itself is computed.
 *   Same state as the store -> split evenly as SGST+CGST (intra-state).
 *   Different state -> the full amount as IGST instead (inter-state) -
 *   never both SGST/CGST and IGST on the same line.
 *
 * storeState/counterpartyState missing (not yet filled in) is treated as
 * intra-state (the existing, pre-IGST behavior) rather than guessing wrong -
 * an incomplete address shouldn't silently switch a domestic sale to IGST.
 */
export function computeGst(
  taxableValue: number,
  ratePercent: number,
  scheme: GstScheme,
  storeState: string | null | undefined,
  counterpartyState: string | null | undefined
): GstBreakdown {
  if (scheme === "COMPOSITION") {
    return { sgst: 0, cgst: 0, igst: 0, isInterState: false }
  }

  const isInterState =
    !!storeState && !!counterpartyState && normalizeState(storeState) !== normalizeState(counterpartyState)

  const totalTax = (taxableValue * ratePercent) / 100

  if (isInterState) {
    return { sgst: 0, cgst: 0, igst: totalTax, isInterState: true }
  }

  const half = totalTax / 2
  return { sgst: half, cgst: half, igst: 0, isInterState: false }
}
