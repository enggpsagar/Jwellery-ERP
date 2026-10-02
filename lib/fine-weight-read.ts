// lib/fine-weight-read.ts
//
// Client-safe read side of lib/fine-weight.ts (which is server-only): every
// balance, total and report sums the stored pure-metal `fineWeight`, never
// the physical `netWeight`. A row written before fineWeight existed (or one
// the backfill missed) falls back to its netWeight — for a non-purity metal
// the two are identical anyway.

/** Pure-metal weight of a stored line/stock row: its fineWeight, falling back to netWeight. */
export function fineOrNet(row: { fineWeight?: unknown; netWeight?: unknown }): number {
  const value = row.fineWeight ?? row.netWeight;
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
