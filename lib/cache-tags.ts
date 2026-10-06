// lib/cache-tags.ts
// Tag names for unstable_cache entries, shared between the code that caches
// and the code that invalidates so the two can never drift apart.

/** Sidebar badge counts for one store (every role/location-scope variant). */
export function sidebarCountsTag(storeId: string): string {
  return `sidebar-counts:${storeId}`;
}
