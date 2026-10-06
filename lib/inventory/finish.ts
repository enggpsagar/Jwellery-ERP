import type { InventoryFinish } from "@prisma/client"

// Display labels for InventoryFinish. The enum values (KACHA/PAKKA) are
// storage keys only — never show or export them raw, since "Kacha" also
// names the Estimate slip in Billing and reads as the wrong thing here.
export const FINISH_LABELS: Record<InventoryFinish, string> = {
  KACHA: "Unfinished",
  PAKKA: "Finished / Hallmarked",
}

export function finishLabel(finish: InventoryFinish | string | null | undefined): string {
  return finish && finish in FINISH_LABELS ? FINISH_LABELS[finish as InventoryFinish] : "-"
}

/** Accepts the label or the raw enum value (case-insensitive) from an import sheet. */
export function parseFinishLabel(raw: string): InventoryFinish | null {
  const value = raw.trim().toLowerCase()
  if (["kacha", "unfinished"].includes(value)) return "KACHA"
  if (["pakka", "finished", "hallmarked", "finished / hallmarked", "finished/hallmarked"].includes(value)) return "PAKKA"
  return null
}
