// What fineness % a purity label implies (22K → 91.6, 925 → 92.5), and
// whether a stored purity disagrees with it. Every pure (24K / 999) weight
// total multiplies by a purity's finenessPercent (lib/fine-weight.ts), so a
// "22K" saved at 100% silently counts as pure gold everywhere — Settings →
// Metals & Categories flags those. Shared by taxonomy-actions.ts (default
// for a blank fineness, server-side fix) and the settings UI (the warning).

import { DEFAULT_FINENESS, matchLegacyPurityType } from "@/lib/purity"
import { classifyMetalName } from "@/lib/business-units"

/** Allowed gap between a stored fineness and the label's standard one. */
export const FINENESS_TOLERANCE = 0.05

/**
 * The standard fineness % a purity label implies, or null when the label
 * doesn't imply one (a custom name like "Hallmark special"): a known
 * standard for the metal (22K, 925, 950…), else karat/24 for a gold-style
 * "nK" label, else a 3-digit millesimal (958 → 95.8).
 */
export function expectedFinenessForLabel(metalName: string, label: string): number | null {
  const family = classifyMetalName(metalName)
  const legacy = matchLegacyPurityType(family, label)
  if (legacy) return DEFAULT_FINENESS[legacy]

  const karat = /^(\d{1,2}(?:\.\d+)?)\s*k(?:t|arat)?$/i.exec(label.trim())
  if (karat && Number(karat[1]) > 0 && Number(karat[1]) <= 24) {
    return Math.round((Number(karat[1]) / 24) * 1000) / 10
  }

  const millesimal = /^(\d{3})$/.exec(label.trim())
  if (millesimal && Number(millesimal[1]) > 0 && Number(millesimal[1]) <= 1000) return Number(millesimal[1]) / 10

  return null
}

/** Fineness % to save when none is typed: the label's standard figure, else 100. */
export function defaultFinenessForLabel(metalName: string, label: string): number {
  return expectedFinenessForLabel(metalName, label) ?? 100
}

/**
 * The fineness % this purity should have, when its stored figure is off by
 * more than FINENESS_TOLERANCE; null when it matches or the label implies
 * no standard.
 */
export function finenessMismatch(metalName: string, label: string, finenessPercent: number): number | null {
  const expected = expectedFinenessForLabel(metalName, label)
  if (expected == null) return null
  return Math.abs(Number(finenessPercent) - expected) > FINENESS_TOLERANCE ? expected : null
}
