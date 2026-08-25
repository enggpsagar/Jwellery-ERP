"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type ChargeType = "FIXED" | "PERCENTAGE"

type MakingChargeInputProps = {
  /** Per-gram metal rate for this line, used to derive the flat amount in % mode. */
  rate: number
  /** Net weight for this line, used to derive the flat amount in % mode. */
  netWeight: number
  /** The stored making charge — always a flat ₹ amount, in both modes. */
  value: number
  onChange: (value: number) => void
  /** Which mode this line was last saved as — defaults to FIXED for new lines. */
  chargeType?: ChargeType
  /** Reports the mode so the parent can persist it alongside the resolved ₹ value. */
  onChargeTypeChange?: (chargeType: ChargeType) => void
  label?: string
  className?: string
}

/**
 * A making-charge field that can be entered as a flat ₹ amount or as a % of
 * metal value (rate x netWeight) — in % mode the computed flat amount is
 * what's reported via onChange, so the stored/submitted amount is always a
 * plain ₹ number, unchanged from how every making-charge column is modeled.
 * The chosen mode is reported separately via onChargeTypeChange so the
 * parent can persist it (ChargeType) and restore the % framing on edit —
 * the % itself isn't stored, so on mount with chargeType="PERCENTAGE" it's
 * back-derived from value/metalValue.
 */
export function MakingChargeInput({
  rate,
  netWeight,
  value,
  onChange,
  chargeType,
  onChargeTypeChange,
  label = "Making Charge",
  className,
}: MakingChargeInputProps) {
  const metalValue = rate * netWeight

  const [mode, setMode] = useState<"flat" | "percent">(
    chargeType === "PERCENTAGE" ? "percent" : "flat",
  )
  const [percent, setPercent] = useState(() =>
    chargeType === "PERCENTAGE" && metalValue > 0
      ? Number(((value / metalValue) * 100).toFixed(2))
      : 0,
  )

  const switchToPercent = () => {
    setMode("percent")
    onChargeTypeChange?.("PERCENTAGE")
    if (metalValue > 0) {
      setPercent(Number(((value / metalValue) * 100).toFixed(2)))
    }
  }

  const switchToFlat = () => {
    setMode("flat")
    onChargeTypeChange?.("FIXED")
  }

  const handlePercentChange = (raw: string) => {
    const p = Number(raw) || 0
    setPercent(p)
    onChange(Number(((p / 100) * metalValue).toFixed(2)))
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>

        <div className="flex rounded-md border p-0.5 text-xs">
          <Button
            type="button"
            size="sm"
            variant={mode === "flat" ? "default" : "ghost"}
            className="h-6 px-2"
            onClick={switchToFlat}
          >
            ₹
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "percent" ? "default" : "ghost"}
            className="h-6 px-2"
            onClick={switchToPercent}
          >
            %
          </Button>
        </div>
      </div>

      {mode === "flat" ? (
        <Input
          type="number"
          step="0.01"
          value={value === 0 ? "" : value}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
        />
      ) : (
        <div className="space-y-1">
          <Input
            type="number"
            step="0.01"
            value={percent === 0 ? "" : percent}
            onChange={(event) => handlePercentChange(event.target.value)}
            placeholder="% of metal value"
          />
          <p className="text-xs text-muted-foreground">
            = ₹{((percent / 100) * metalValue).toFixed(2)}
          </p>
        </div>
      )}
    </div>
  )
}
