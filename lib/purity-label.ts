// When two purity labels under one metal mean the same purity — so a store
// can't end up with both "18" and "18K" (it happened: Settings had both, and
// products were split across them). Client-safe, no DB.
//
//   "18", "18K", "18 kt", "18KT", "18 karat", "18 carat" → "18k"
//   "925", "925 ", "925.0"                                 → "925"
//   anything else                                          → lower-cased, spaces removed
//
// A bare number up to 24 is read as karats (gold-style); a larger one is a
// millesimal fineness (925, 999), so 925 and 999 never collide with karats.
export function purityLabelKey(label: string): string {
  const compact = label.trim().toLowerCase().replace(/\s+/g, "")
  const match = /^(\d+(?:\.\d+)?)(k|kt|karat|carat|ct)?$/.exec(compact)
  if (!match) return compact
  const value = Number(match[1])
  if (match[2] || value <= 24) return `${value}k`
  return String(value)
}

/** The existing purity a new label would duplicate, if any. */
export function findDuplicatePurity<T extends { id: string; label: string }>(
  purities: T[],
  label: string,
  ignoreId?: string,
): T | undefined {
  const key = purityLabelKey(label)
  return purities.find((p) => p.id !== ignoreId && purityLabelKey(p.label) === key)
}
