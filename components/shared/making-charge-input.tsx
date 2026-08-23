"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type MakingChargeInputProps = {
  /** Per-gram metal rate for this line, used to derive the flat amount in % mode. */
  rate: number
  /** Net weight for this line, used to derive the flat amount in % mode. */
  netWeight: number
  /** The stored making charge — always a flat ₹ amount, in both modes. */
  value: number
  onChange: (value: number) => void
  label?: string
  className?: string
}

/**
 * A making-charge field that can be entered as a flat ₹ amount or as a % of
 * metal value (rate x netWeight) — in % mode the computed flat amount is
 * what's actually reported via onChange, so the stored/submitted value is
 * always a plain ₹ number, unchanged from how every making-charge column is
 * modeled today. The % toggle is purely a data-entry convenience.
 */
export function MakingChargeInput({
  rate,
  netWeight,
  value,
  onChange,
  label = "Making Charge",
  className,
}: MakingChargeInputProps) {
  const [mode, setMode] = useState<"flat" | "percent">("flat")
  const [percent, setPercent] = useState(0)

  const metalValue = rate * netWeight

  const switchToPercent = () => {
    setMode("percent")
    if (metalValue > 0) {
      setPercent(Number(((value / metalValue) * 100).toFixed(2)))
    }
  }

  const switchToFlat = () => {
    setMode("flat")
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
