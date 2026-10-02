"use client"

import { Plus, Trash2 } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequiredMark } from "@/components/shared/required-mark"
import { DEFAULT_FINENESS, PURITY_SELECT_OPTIONS, matchLegacyPurityType } from "@/lib/purity"
import { classifyPurityFamily } from "@/lib/business-units"
import {
  oldGoldFineWeight,
  oldGoldLineValue,
  type OldGoldExcessModeValue,
  type OldGoldLineDraft,
} from "@/lib/old-gold/value"
import type { StoreMetalPurityRow, StoreMetalRow } from "@/lib/actions/taxonomy-actions"

const PAYOUT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "NET_BANKING", label: "Net Banking" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
]

export function emptyOldGoldLine(rate = 0): OldGoldLineDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    metalTypeId: "",
    purityLabel: "",
    purity: "",
    grossWeight: 0,
    netWeight: 0,
    deductionPercent: 0,
    rate,
  }
}

/** Fineness % of a line's purity — the metal's own purity row, else the
 *  store's per-enum table — same precedence as lib/fine-weight.ts. */
export function oldGoldLineFineness(
  line: OldGoldLineDraft,
  purities: StoreMetalPurityRow[] | undefined,
  enumFineness: Record<string, number>,
) {
  const row = line.purityLabel ? purities?.find((p) => p.label === line.purityLabel) : undefined
  if (row) return row.finenessPercent
  if (line.purity) return enumFineness[line.purity] ?? DEFAULT_FINENESS[line.purity as keyof typeof DEFAULT_FINENESS] ?? 100
  return 100
}

type Props = {
  lines: OldGoldLineDraft[]
  onLinesChange: (lines: OldGoldLineDraft[]) => void
  metals: StoreMetalRow[]
  puritiesByMetal: Record<string, StoreMetalPurityRow[]>
  ensurePurities: (metalTypeId: string) => void
  enumFineness: Record<string, number>
  /** Today's fine rates (Metal Rates) to prefill a line's rate. */
  fineRates: { gold: number | null; silver: number | null }
  /** Value beyond what the bill needs, and how it's settled. */
  excess: number
  excessMode: OldGoldExcessModeValue
  onExcessModeChange: (mode: OldGoldExcessModeValue) => void
  payoutMethod: string
  onPayoutMethodChange: (method: string) => void
  payoutReference: string
  onPayoutReferenceChange: (reference: string) => void
}

/**
 * Old Gold Exchange — the Customer → Business half of a sale where the
 * customer hands in old gold. Each line's 24K (fine) weight and value are
 * previewed live; createInvoice recomputes them (lib/old-gold/exchange.ts).
 */
export function OldGoldExchangeSection({
  lines,
  onLinesChange,
  metals,
  puritiesByMetal,
  ensurePurities,
  enumFineness,
  fineRates,
  excess,
  excessMode,
  onExcessModeChange,
  payoutMethod,
  onPayoutMethodChange,
  payoutReference,
  onPayoutReferenceChange,
}: Props) {
  const purityMetals = metals.filter((metal) => metal.hasPurity && !metal.isGemstone && metal.isActive)
  const metalById = new Map(metals.map((metal) => [metal.id, metal]))

  const rateFor = (metalTypeId: string) => {
    const family = classifyPurityFamily(metalById.get(metalTypeId) ?? { name: "" })
    if (family === "GOLD") return fineRates.gold ?? 0
    if (family === "SILVER") return fineRates.silver ?? 0
    return 0
  }

  const update = (key: string, patch: Partial<OldGoldLineDraft>) =>
    onLinesChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const computed = lines.map((line) => {
    const fineness = oldGoldLineFineness(line, puritiesByMetal[line.metalTypeId], enumFineness)
    const fine = oldGoldFineWeight(line.netWeight, fineness)
    return { fineness, fine, value: oldGoldLineValue(fine, line.rate, line.deductionPercent) }
  })
  const totalNet = lines.reduce((sum, line) => sum + (line.netWeight || 0), 0)
  const totalFine = computed.reduce((sum, row) => sum + row.fine, 0)
  const totalValue = computed.reduce((sum, row) => sum + row.value, 0)

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4" data-testid="old-gold-section">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">Old Gold Exchange</p>
          <p className="text-xs text-muted-foreground">
            Old gold the customer gives in — bought by the business, added to old-gold stock at its 24K weight, and
            adjusted against this bill.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onLinesChange([...lines, emptyOldGoldLine()])}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add old gold
        </Button>
      </div>

      {lines.map((line, index) => {
        const metal = metalById.get(line.metalTypeId)
        const purities = (puritiesByMetal[line.metalTypeId] ?? []).filter(
          (p) => p.isActive || p.label === line.purityLabel,
        )
        const family = metal ? classifyPurityFamily(metal) : null
        const legacyOptions = PURITY_SELECT_OPTIONS.filter((option) =>
          family ? option.value.startsWith(`${family}_`) : false,
        )
        const { fineness, fine, value } = computed[index]
        return (
          <div key={line.key} className="space-y-3 rounded-md border bg-background p-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Description</Label>
                <Input
                  placeholder="e.g. Old chain"
                  value={line.description}
                  onChange={(e) => update(line.key, { description: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Metal <RequiredMark />
                </Label>
                <Select
                  value={line.metalTypeId || undefined}
                  onValueChange={(value) => {
                    ensurePurities(value)
                    update(line.key, {
                      metalTypeId: value,
                      purityLabel: "",
                      purity: "",
                      rate: line.rate || rateFor(value),
                    })
                  }}
                >
                  <SelectTrigger className="h-10 w-full" data-testid="old-gold-metal">
                    <SelectValue placeholder="Select metal" />
                  </SelectTrigger>
                  <SelectContent>
                    {purityMetals.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Purity (carat) <RequiredMark />
                </Label>
                <Select
                  value={line.purityLabel ? `label:${line.purityLabel}` : line.purity ? `enum:${line.purity}` : undefined}
                  onValueChange={(value) => {
                    if (value.startsWith("label:")) {
                      const label = value.slice(6)
                      update(line.key, {
                        purityLabel: label,
                        purity: metal ? matchLegacyPurityType(classifyPurityFamily(metal), label) ?? "" : "",
                      })
                    } else {
                      update(line.key, { purityLabel: "", purity: value.slice(5) })
                    }
                  }}
                  disabled={!line.metalTypeId}
                >
                  <SelectTrigger className="h-10 w-full" data-testid="old-gold-purity">
                    <SelectValue placeholder={line.metalTypeId ? "Select purity" : "Select a metal first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {purities.length
                      ? purities.map((p) => (
                          <SelectItem key={p.id} value={`label:${p.label}`}>
                            {p.label} ({p.finenessPercent}%)
                          </SelectItem>
                        ))
                      : legacyOptions.map((option) => (
                          <SelectItem key={option.value} value={`enum:${option.value}`}>
                            {option.label} ({enumFineness[option.value] ?? DEFAULT_FINENESS[option.value]}%)
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <div className="space-y-1">
                <Label className="text-xs">Gross Wt (g)</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={line.grossWeight || ""}
                  onChange={(e) => {
                    const grossWeight = Number(e.target.value) || 0
                    update(line.key, {
                      grossWeight,
                      // Net follows gross until it's typed separately.
                      netWeight: !line.netWeight || line.netWeight === line.grossWeight ? grossWeight : line.netWeight,
                    })
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Net Wt (g) <RequiredMark />
                </Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  data-testid="old-gold-net"
                  value={line.netWeight || ""}
                  onChange={(e) => update(line.key, { netWeight: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Deduction %</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  max={99}
                  data-testid="old-gold-deduction"
                  value={line.deductionPercent || ""}
                  onChange={(e) => update(line.key, { deductionPercent: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  24K Rate / g <RequiredMark />
                </Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  data-testid="old-gold-rate"
                  value={line.rate || ""}
                  onChange={(e) => update(line.key, { rate: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">24K Fine Wt</Label>
                <p className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm" data-testid="old-gold-fine">
                  {fine.toFixed(3)} g
                  {line.netWeight > 0 && fineness !== 100 ? (
                    <span className="ml-1 text-xs text-muted-foreground">@ {fineness}%</span>
                  ) : null}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                <div className="flex items-center gap-1">
                  <p className="flex h-10 flex-1 items-center rounded-md border bg-muted px-3 text-sm font-medium" data-testid="old-gold-value">
                    ₹{value.toFixed(2)}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-9 shrink-0"
                    title="Remove old gold line"
                    onClick={() => onLinesChange(lines.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {lines.length > 0 && (
        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
          <span>
            Net: <span className="font-medium">{totalNet.toFixed(3)} g</span>
          </span>
          <span>
            24K fine: <span className="font-medium">{totalFine.toFixed(3)} g</span>
          </span>
          <span>
            Old gold value: <span className="font-semibold">₹{totalValue.toFixed(2)}</span>
          </span>
        </div>
      )}

      {excess > 0 && (
        <div className="space-y-2 rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
          <p className="font-medium text-emerald-800">
            Old gold is worth ₹{excess.toFixed(2)} more than the bill. How does the customer want the difference?
          </p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="oldGoldExcessModeChoice"
                checked={excessMode === "STORE_CREDIT"}
                onChange={() => onExcessModeChange("STORE_CREDIT")}
              />
              Keep as store credit
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="oldGoldExcessModeChoice"
                checked={excessMode === "PAID_OUT"}
                onChange={() => onExcessModeChange("PAID_OUT")}
              />
              Pay it out now
            </label>
          </div>
          {excessMode === "PAID_OUT" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select value={payoutMethod || undefined} onValueChange={onPayoutMethodChange}>
                <SelectTrigger className="h-9 w-full bg-background">
                  <SelectValue placeholder="Paid by…" />
                </SelectTrigger>
                <SelectContent>
                  {PAYOUT_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-9 bg-background"
                placeholder="Reference (optional)"
                value={payoutReference}
                onChange={(e) => onPayoutReferenceChange(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
