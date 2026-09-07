// Pure, environment-agnostic "Round Off" logic — imported by every
// document's server action (to persist the real figures) AND its form
// component (to show a live preview), same dependency-free convention as
// lib/inventory/product-sku.ts, so the two can never disagree.

/**
 * Rounds a raw computed total (subtotal + charges - discount + tax) to the
 * nearest whole rupee, the standard convention on Indian billing documents
 * — a "Round Off" line absorbs the paise so the final Total is always a
 * clean number. `roundOffAmount` is the signed adjustment applied: negative
 * when the raw total rounded down, positive when it rounded up, zero when
 * the raw total was already a whole rupee.
 */
export function computeRoundOff(rawTotal: number): {
  roundOffAmount: number;
  totalAmount: number;
} {
  const totalAmount = Math.round(rawTotal);
  const roundOffAmount = Number((totalAmount - rawTotal).toFixed(2));
  return { roundOffAmount, totalAmount };
}
