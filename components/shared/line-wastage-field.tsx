"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useWeightSettings } from "@/components/providers/weight-settings-provider"
import { calcFineWeight, formatWeight } from "@/lib/weight-calc"

type Props = {
  /** undefined = not set yet (the server applies the purity's default). */
  value: number | null | undefined
  onChange: (value: number | null) => void
  /** The line's weights and purity, for the live fine-weight preview. */
  grossWeight: number
  netWeight: number
  finenessPercent: number | null
  hasPurity: boolean
  testId?: string
}

/**
 * A sale / purchase line's Wastage % (Settings > Weights) with a live
 * preview of the fine (24K) weight it gives — lib/weight-calc.ts, the same
 * calculator the server stores the line with. Shown while wastage counts in
 * the fine weight, or when the line already carries one (copied from the
 * purity's default in Settings › Metals & Categories, editable here).
 */
export function LineWastageField({ value, onChange, grossWeight, netWeight, finenessPercent, hasPurity, testId = "line-wastage" }: Props) {
  const settings = useWeightSettings()
  if (!hasPurity) return null
  if (!settings.addWastageToFineWeight && !((value ?? 0) > 0)) return null

  const fine =
    netWeight > 0 && finenessPercent != null
      ? calcFineWeight({ netWeight, grossWeight, finenessPercent, wastagePercent: value, hasPurity: true }, settings)
      : null

  return (
    <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
      <Label className="text-xs">Wastage %</Label>
      <Input
        type="number"
        step="any"
        min={0}
        className="h-11"
        placeholder="None"
        data-testid={testId}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
      {fine != null ? (
        <p className="text-[10px] leading-tight text-muted-foreground" data-testid={`${testId}-fine`}>
          Fine 24K {formatWeight(fine, "GRAM", settings)} g
          {settings.addWastageToFineWeight ? "" : " (wastage not counted — Settings › Weights)"}
        </p>
      ) : null}
    </div>
  )
}
