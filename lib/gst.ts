import type { GstScheme, PartyGstType } from "@prisma/client"

/**
 * Single source of truth for GST calculation and display rules across
 * Billing, Quotations, and Purchases. See GstScheme's own doc comment in
 * schema.prisma for the legal reasoning behind each scheme's behavior, and
 * PartyGstType's for how a Customer's/Vendor's own registration differs
 * from the store's.
 */

export const GST_SCHEME_OPTIONS: { value: GstScheme; label: string; description: string }[] = [
  {
    value: "REGULAR_B2C",
    label: "Retailer (B2C)",
    description:
      "Selling mostly to end consumers. Full GST charged and shown on every invoice. New customers/vendors default to Not GST Registered — override this per record for the odd registered-business buyer.",
  },
  {
    value: "REGULAR_B2B",
    label: "Wholesaler & Manufacturer (B2B)",
    description:
      "Selling mostly to other GST-registered businesses. Full GST charged and shown, same as B2C. New customers/vendors default to Regular (GSTIN required) — override this per record for the odd walk-in/individual buyer.",
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

/**
 * A Customer's or Vendor's own GST registration status - see PartyGstType's
 * doc comment in schema.prisma. Shown as a 3-option picker on the Customer
 * and Vendor forms, mirroring GST_SCHEME_OPTIONS's own picker, but this is
 * never the same setting as the store's gstScheme: it describes the OTHER
 * party's registration, not ours.
 */
export const PARTY_GST_TYPE_OPTIONS: { value: PartyGstType; label: string; description: string }[] = [
  {
    value: "UNREGISTERED",
    label: "Not GST Registered",
    description: "No GSTIN. Treated as a B2C party — GSTIN is never required or shown.",
  },
  {
    value: "REGULAR",
    label: "Regular",
    description:
      "Has a GSTIN and charges/receives full GST normally. As a Vendor, their purchase invoice to us legitimately carries GST.",
  },
  {
    value: "COMPOSITION",
    label: "Composition Scheme",
    description:
      "Has a GSTIN, but is legally barred from itemizing GST on any invoice they issue. As a Vendor, their purchase invoice to us never carries a tax breakdown, regardless of our own store's scheme.",
  },
]

export function partyGstTypeLabel(gstType: PartyGstType): string {
  return PARTY_GST_TYPE_OPTIONS.find((o) => o.value === gstType)?.label ?? gstType
}

/** Whether a customer's/vendor's own GSTIN is required for a valid B2B tax
 *  invoice/purchase entry. Driven by that specific party's own `gstType` —
 *  both REGULAR and COMPOSITION mean "has a GSTIN," so both require it to be
 *  captured; only UNREGISTERED doesn't. The one store-wide exception is our
 *  own Composition scheme: a Composition dealer issues a Bill of Supply to
 *  everyone, so capturing the other party's GSTIN doesn't apply there
 *  either, regardless of their own gstType. `REGULAR_B2C`/`REGULAR_B2B` only
 *  decide the *default* gstType for a newly-created customer/vendor (see
 *  defaultPartyGstType) — they impose no restriction afterward. */
export function gstinRequired(scheme: GstScheme, partyGstType: PartyGstType): boolean {
  return scheme !== "COMPOSITION" && partyGstType !== "UNREGISTERED"
}

/** Default value for a new customer/vendor's own `gstType` — just a
 *  starting point the record can be edited away from afterward, never a
 *  restriction. Never defaults to COMPOSITION: that's a specific fact about
 *  the other party we'd only know if told, not something to guess. */
export function defaultPartyGstType(scheme: GstScheme): PartyGstType {
  return scheme === "REGULAR_B2B" ? "REGULAR" : "UNREGISTERED"
}

/** Whether a VENDOR's own invoice to us can legally carry a GST line at
 *  all. Only a REGULAR-registered vendor charges GST — a COMPOSITION vendor
 *  is legally barred from itemizing it, and an UNREGISTERED vendor has no
 *  GSTIN to charge it under. This is independent of our own store's
 *  gstScheme: our own Composition status only affects whether WE can claim
 *  a purchase's GST as input credit (see isItcEligible), never whether the
 *  vendor's invoice shows GST in the first place — that's purely the
 *  vendor's own registration, not ours. */
export function isVendorGstApplicable(vendorGstType: PartyGstType): boolean {
  return vendorGstType === "REGULAR"
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

/** Same state as the store -> split evenly as SGST+CGST (intra-state).
 *  Different state -> the full amount as IGST instead (inter-state) - never
 *  both SGST/CGST and IGST on the same line. Missing state (not yet filled
 *  in) is treated as intra-state rather than guessing wrong - an incomplete
 *  address shouldn't silently switch a domestic transaction to IGST. Shared
 *  by computeGst and computePurchaseGst once each has established GST
 *  applies at all - this part of the math never depends on who's involved,
 *  only on which two states the transaction crosses. */
function splitGst(
  taxableValue: number,
  ratePercent: number,
  storeState: string | null | undefined,
  counterpartyState: string | null | undefined
): GstBreakdown {
  const isInterState =
    !!storeState && !!counterpartyState && normalizeState(storeState) !== normalizeState(counterpartyState)

  const totalTax = (taxableValue * ratePercent) / 100

  if (isInterState) {
    return { sgst: 0, cgst: 0, igst: totalTax, isInterState: true }
  }

  const half = totalTax / 2
  return { sgst: half, cgst: half, igst: 0, isInterState: false }
}

/**
 * Computes the GST split for one SALE (Invoice/Quotation) line, given the
 * store's own scheme and the two parties' states.
 *
 * - COMPOSITION: always zero on all three components, unconditionally - see
 *   GstScheme's doc comment for why this isn't just a UI default, it's a
 *   legal requirement. The customer's own gstType never overrides this -
 *   we're the ones issuing the invoice, so it's our own registration that
 *   decides what it can show.
 * - REGULAR_B2C / REGULAR_B2B: identical tax-split behavior - they only set
 *   the default gstType for a new customer/vendor (see defaultPartyGstType
 *   above), not how the tax itself is computed.
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

  return splitGst(taxableValue, ratePercent, storeState, counterpartyState)
}

/**
 * Computes the GST split for one PURCHASE line, given the VENDOR's own
 * gstType - deliberately NOT our own store's gstScheme. A purchase's GST is
 * whatever the vendor's real invoice shows, which depends on how the
 * VENDOR is registered, not on how we are - see isVendorGstApplicable's doc
 * comment. Our own Composition status still matters for the purchase, just
 * not here: it's isItcEligible() that decides whether this (correctly
 * recorded) tax can be claimed back, never whether it gets recorded.
 */
export function computePurchaseGst(
  taxableValue: number,
  ratePercent: number,
  vendorGstType: PartyGstType,
  storeState: string | null | undefined,
  vendorState: string | null | undefined
): GstBreakdown {
  if (!isVendorGstApplicable(vendorGstType)) {
    return { sgst: 0, cgst: 0, igst: 0, isInterState: false }
  }

  return splitGst(taxableValue, ratePercent, storeState, vendorState)
}
