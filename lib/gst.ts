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
    description:
      "Selling mostly to end consumers. Full GST charged and shown on every invoice. New customers/vendors default to not GST-registered (GSTIN optional) — override this per record for the odd registered-business buyer.",
  },
  {
    value: "REGULAR_B2B",
    label: "Wholesaler & Manufacturer (B2B)",
    description:
      "Selling mostly to other GST-registered businesses. Full GST charged and shown, same as B2C. New customers/vendors default to GST-registered (GSTIN required) — override this per record for the odd walk-in/individual buyer.",
  },
  {
    value: "COMPOSITION",
    label: "Small Local Jeweler (Composition Scheme)",
    description:
      "Simplified scheme for small businesses under the turnover threshold. GST can never be shown or collected as a line item on any document - documents print as a Bill of Supply with the mandatory disclaimer instead of a Tax Invoice, and purchases are never eligible for input tax credit. This is the one setting here that's genuinely store-wide, regardless of any individual customer/vendor's own GST registration.",
  },
]

export function gstSchemeLabel(scheme: GstScheme): string {
  return GST_SCHEME_OPTIONS.find((o) => o.value === scheme)?.label ?? scheme
}

/** Whether a customer/vendor's own GSTIN is required for a valid B2B tax
 *  invoice/purchase entry. B2B vs B2C is legally a property of the
 *  COUNTERPARTY, not the store — a Wholesaler & Manufacturer store still
 *  routinely sells to individual, non-registered buyers, so this is driven
 *  by that specific customer/vendor's own `isGstRegistered` flag, never by
 *  the store's gstScheme alone. The one genuine store-wide exception is
 *  Composition: a Composition dealer issues a Bill of Supply to everyone, so
 *  the buyer/vendor's own GST registration is irrelevant here regardless of
 *  what their own flag says. `REGULAR_B2C`/`REGULAR_B2B` only decide the
 *  *default* value of `isGstRegistered` for a newly-created customer/vendor
 *  (see GST_SCHEME_OPTIONS) — they impose no restriction afterward. */
export function gstinRequired(scheme: GstScheme, partyIsGstRegistered: boolean): boolean {
  return scheme !== "COMPOSITION" && partyIsGstRegistered
}

/** Default value for a new customer/vendor's own `isGstRegistered` flag —
 *  just a starting point the record can be edited away from afterward, not
 *  a restriction. See gstinRequired's doc comment for why this can't be
 *  the store-wide answer on its own. */
export function defaultIsGstRegistered(scheme: GstScheme): boolean {
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
 * - REGULAR_B2C / REGULAR_B2B: identical tax-split behavior - they only set
 *   the default for a new customer/vendor's own GST-registered flag (see
 *   gstinRequired above), not how the tax itself is computed.
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
