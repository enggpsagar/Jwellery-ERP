"use client"

import { useWeightFormat } from "@/components/providers/weight-settings-provider"
import type { WeightUnitValue } from "@/lib/weight-calc"

/**
 * A weight shown with the store's Settings > Weights decimals — for
 * components rendered from both server pages and client panels, which can't
 * call useWeightFormat() themselves. Display only.
 *
 *   <WeightText value={9.7} />                 9.700 g
 *   <WeightText value={0.28} unit="CARAT" />    0.280 ct
 *   <WeightText value={0.28} stone />           0.28 ct (stone-row carats)
 *   <WeightText value={9.7} suffix={false} />  9.700
 */
export function WeightText({
  value,
  unit = "GRAM",
  stone = false,
  suffix = true,
  fallback = "",
}: {
  value: number | string | null | undefined
  unit?: WeightUnitValue | string | null
  /** A stone row's carats (at most 2 decimals). */
  stone?: boolean
  suffix?: boolean
  /** Shown when value is blank. */
  fallback?: string
}) {
  const wf = useWeightFormat()
  const carat = stone || unit === "CARAT"
  const text = stone ? wf.stoneCt(value) : carat ? wf.ct(value) : wf.g(value)
  if (text === "") return <>{fallback}</>
  return <>{suffix ? `${text} ${carat ? "ct" : "g"}` : text}</>
}
