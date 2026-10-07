// lib/cache-tags.ts
// Tag names for unstable_cache entries, shared between the code that caches
// and the code that invalidates so the two can never drift apart.

/** Sidebar badge counts for one store (every role/location-scope variant). */
export function sidebarCountsTag(storeId: string): string {
  return `sidebar-counts:${storeId}`;
}

/** The top bar rates chip's data for one store (its purities, stone types,
 * selling prices and last change). Updated by every action that changes one. */
export function sellingRatesTag(storeId: string): string {
  return `selling-rates:${storeId}`;
}
