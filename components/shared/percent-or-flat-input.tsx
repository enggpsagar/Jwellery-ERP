"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type PercentOrFlatInputProps = {
  /** What % is computed against — e.g. the pre-discount, pre-tax invoice
   * total for a whole-document Discount field. */
  base: number
  /** The stored amount — always a flat ₹ amount, in both modes (same
   * convention as MakingChargeInput's `value`). */
  value: number
  onChange: (value: number) => void
  label?: string
  className?: string
}

/**
 * A generic %-of-base-or-flat-₹ field — the same toggle UX as
 * MakingChargeInput (components/shared/making-charge-input.tsx), extracted
 * with a plain `base` number instead of that component's line-item-specific
 * `rate`/`netWeight` pair, so a whole-document field (e.g. Discount, applied
 * against the pre-discount subtotal rather than a single line's metal
 * value) can reuse the identical, already-hardened logic instead of a
 * mismatched rate/netWeight hack.
 *
 * Critically includes the fix MakingChargeInput needed after a real
 * production bug: in percent mode, the stored flat ₹ amount must re-derive
 * whenever `base` changes (e.g. line items are edited after the discount
 * percent was set), not just when the percent field itself is typed —
 * otherwise the displayed "= ₹X" hint keeps recalculating live and looks
 * correct while the actual stored/submitted amount silently goes stale.
 */
export function PercentOrFlatInput({
  base,
  value,
  onChange,
  label = "Discount",
  className,
}: PercentOrFlatInputProps) {
  const [mode, setMode] = useState<"flat" | "percent">("flat")
  const [percent, setPercent] = useState(0)

  const switchToPercent = () => {
    setMode("percent")
    if (base > 0) {
      setPercent(Number(((value / base) * 100).toFixed(2)))
    }
  }

  const switchToFlat = () => {
    setMode("flat")
  }

  const handlePercentChange = (raw: string) => {
    const p = Number(raw) || 0
    setPercent(p)
    onChange(Number(((p / 100) * base).toFixed(2)))
  }

  // See this component's own doc comment above — without this, `value`
  // freezes at whatever `base` was when the percent was last typed.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (mode !== "percent") return
    const resolved = Number(((percent / 100) * base).toFixed(2))
    if (resolved !== value) onChangeRef.current(resolved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, percent, base])

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>

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
            placeholder="% of pre-tax total"
          />
          <p className="text-xs text-muted-foreground">
            = ₹{((percent / 100) * base).toFixed(2)}
          </p>
        </div>
      )}
    </div>
  )
}
