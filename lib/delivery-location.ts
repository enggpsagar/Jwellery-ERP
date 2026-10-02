// lib/delivery-location.ts
//
// Shared by every Invoice create/edit/replace page — plain sync helper, not
// a server action, so it can be called straight from a Server Component
// without its own round trip.

import type { StateOption } from "@/lib/actions/location-actions"

/**
 * Narrows the full State list down to a store's curated
 * BusinessSettings.allowedDeliveryStateIds subset (see that field's doc
 * comment in schema.prisma). Empty means the store hasn't picked any
 * Delivery Locations, so none are offered and the invoice form hides the
 * field entirely (the sale is treated as intra-state, same as a blank one).
 *
 * `mustIncludeName` keeps an already-saved invoice's own delivery state
 * selectable even if a Store Admin later un-checked it — the edit page
 * passes the invoice's own `deliveryState` here so switching away from a
 * removed state stays optional, not forced by a silently-blank picker.
 */
export function filterDeliveryStates(
  states: StateOption[],
  allowedStateIds: string[],
  mustIncludeName?: string | null,
): StateOption[] {
  const allowed = new Set(allowedStateIds)
  const filtered = states.filter((state) => allowed.has(state.id))

  if (mustIncludeName && !filtered.some((state) => state.name === mustIncludeName)) {
    const missing = states.find((state) => state.name === mustIncludeName)
    if (missing) filtered.push(missing)
  }

  return filtered
}
