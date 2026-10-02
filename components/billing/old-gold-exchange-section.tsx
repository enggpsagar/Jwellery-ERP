"use client"

import { Coins, Plus, Trash2 } from "lucide-react"

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
import { StonePresenceQuestion } from "@/components/shared/stone-presence-question"
import { StoneComponentFields } from "@/components/inventory/shared/stone-component-fields"
import { DEFAULT_FINENESS, GRAMS_PER_CARAT, PURITY_SELECT_OPTIONS, matchLegacyPurityType } from "@/lib/purity"
import { classifyPurityFamily } from "@/lib/business-units"
import {
  netAfterStone,
  oldGoldFineWeight,
  oldGoldLineTotal,
  oldGoldLineValue,
  round2,
  type OldGoldExcessModeValue,
  type OldGoldLineDraft,
} from "@/lib/old-gold/value"
import type { StoreMetalOriginRow, StoreMetalPurityRow, StoreMetalRow } from "@/lib/actions/taxonomy-actions"

const PAYOUT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "NET_BANKING", label: "Net Banking" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
]

const rupees = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
    netTouched: false,
    hasStone: false,
    stoneMetalTypeName: "",
    stoneTypeNames: [],
    caratWeight: 0,
    stoneWeightGrams: 0,
    stoneWeightUnit: "CARAT",
    netStoneWeightTouched: false,
    stoneRate: 0,
    stoneCharge: 0,
    stoneChargeTouched: false,
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

/** Every figure of one line, as the form previews it (createInvoice
 *  recomputes them — lib/old-gold/exchange.ts). */
export function oldGoldLineAmounts(
  line: OldGoldLineDraft,
  purities: StoreMetalPurityRow[] | undefined,
  enumFineness: Record<string, number>,
  /** A loose diamond/gemstone: priced by carats × rate per carat, no purity. */
  isGemstone = false,
) {
  if (isGemstone) {
    const value = round2(
      Math.max(line.caratWeight || 0, 0) * Math.max(line.rate || 0, 0) * (1 - Math.min(Math.max(line.deductionPercent || 0, 0), 100) / 100),
    )
    return { fineness: 100, fine: 0, metalValue: value, stoneValue: 0, total: value }
  }
  const fineness = oldGoldLineFineness(line, purities, enumFineness)
  const fine = oldGoldFineWeight(line.netWeight, fineness)
  const metalValue = oldGoldLineValue(fine, line.rate, line.deductionPercent)
  const stoneValue = line.hasStone ? round2(line.stoneCharge || 0) : 0
  return { fineness, fine, metalValue, stoneValue, total: oldGoldLineTotal(metalValue, stoneValue) }
}

/** The submitted shape of a line (createInvoice's oldGoldJson). */
export function serializeOldGoldLine(line: OldGoldLineDraft) {
  return {
    description: line.description || null,
    metalTypeId: line.metalTypeId || null,
    purityLabel: line.purityLabel || null,
    purity: line.purity || null,
    grossWeight: line.grossWeight || null,
    netWeight: line.netWeight || null,
    deductionPercent: line.deductionPercent || 0,
    rate: line.rate || null,
    hasStone: line.hasStone,
    stoneMetalTypeName: line.hasStone ? line.stoneMetalTypeName || null : null,
    stoneTypeNames: line.hasStone && line.stoneTypeNames.length ? line.stoneTypeNames.join(", ") : null,
    // A stone-in-metal's carats, or a loose stone's own carat weight.
    caratWeight: line.caratWeight || null,
    stoneWeight: line.hasStone ? line.stoneWeightGrams || null : null,
    stoneRate: line.hasStone ? line.stoneRate || null : null,
    stoneCharge: line.hasStone ? line.stoneCharge || 0 : 0,
  }
}

type Props = {
  /** "header": the compact card beside "Add items" at the top of Line
   * Items (title + Add button + running total). "lines": the item cards
   * and settlement, full width under the line items — nothing until an
   * item has been added. */
  part: "header" | "lines"
  lines: OldGoldLineDraft[]
  onLinesChange: (lines: OldGoldLineDraft[]) => void
  metals: StoreMetalRow[]
  origins: StoreMetalOriginRow[]
  onMetalsChange: (next: StoreMetalRow[]) => void
  onOriginsChange: (next: StoreMetalOriginRow[]) => void
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
 * customer hands in old gold. Each piece first asks whether it has a stone;
 * the stone's weight comes off the gross weight and its value is added to
 * the metal's 24K value. Figures are a live preview; createInvoice
 * recomputes them (lib/old-gold/exchange.ts).
 */
export function OldGoldExchangeSection({
  part,
  lines,
  onLinesChange,
  metals,
  origins,
  onMetalsChange,
  onOriginsChange,
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
  // Gold, silver, platinum (anything with a purity) — or a loose diamond /
  // gemstone, which is weighed in carats and has no purity.
  const purityMetals = metals.filter((metal) => metal.hasPurity && !metal.isGemstone && metal.isActive)
  const gemstones = metals.filter((metal) => metal.isGemstone && metal.isActive)
  const metalById = new Map(metals.map((metal) => [metal.id, metal]))

  const rateFor = (metalTypeId: string) => {
    const family = classifyPurityFamily(metalById.get(metalTypeId) ?? { name: "" })
    if (family === "GOLD") return fineRates.gold ?? 0
    if (family === "SILVER") return fineRates.silver ?? 0
    return 0
  }

  /** Applies a patch, then keeps Net Wt = Gross − stone (until typed) and
   *  Stone value = rate × carats (until typed). */
  const update = (key: string, patch: Partial<OldGoldLineDraft>) =>
    onLinesChange(
      lines.map((line) => {
        if (line.key !== key) return line
        const next = { ...line, ...patch }
        if (!next.netTouched && next.grossWeight > 0) {
          next.netWeight = netAfterStone(next.grossWeight, next.hasStone ? next.stoneWeightGrams : 0)
        }
        if (next.hasStone && !next.stoneChargeTouched) {
          next.stoneCharge = round2((next.stoneRate || 0) * (next.caratWeight || 0))
        }
        return next
      }),
    )

  const amounts = lines.map((line) =>
    oldGoldLineAmounts(
      line,
      puritiesByMetal[line.metalTypeId],
      enumFineness,
      Boolean(metalById.get(line.metalTypeId)?.isGemstone),
    ),
  )
  const totalNet = lines.reduce(
    (sum, line) => (metalById.get(line.metalTypeId)?.isGemstone ? sum : sum + (line.netWeight || 0)),
    0,
  )
  const totalFine = amounts.reduce((sum, row) => sum + row.fine, 0)
  const totalValue = round2(amounts.reduce((sum, row) => sum + row.total, 0))

  if (part === "header") {
    return (
      <div className="flex h-full flex-col justify-between gap-3 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
            <Coins className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Customer Exchange</p>
            <p className="text-xs text-muted-foreground">
              Customer selling you old gold, silver or diamonds? It's bought into stock at its pure 24K / 999 weight
              and adjusted against this bill.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            onClick={() => onLinesChange([...lines, emptyOldGoldLine()])}
            className="bg-amber-500 text-white shadow-sm hover:bg-amber-600"
          >
            <Plus className="mr-1.5 size-4" />
            Add item bought
          </Button>
          {lines.length > 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="old-gold-header-summary">
              {lines.length} item{lines.length === 1 ? "" : "s"}
              {totalFine > 0 ? ` · ${totalFine.toFixed(3)} g pure` : ""} ·{" "}
              <span className="font-semibold text-foreground">{rupees(totalValue)}</span>
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  if (lines.length === 0) return null

  return (
    <section
      className="space-y-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
      data-testid="old-gold-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="h-4 w-4 text-amber-600" />
          Bought from the customer
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => onLinesChange([...lines, emptyOldGoldLine()])}>
          <Plus className="mr-1 h-4 w-4" />
          Add another
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
        const isGem = Boolean(metal?.isGemstone)
        const { fineness, fine, metalValue, stoneValue, total } = amounts[index]
        return (
          <div key={line.key} className="space-y-3 rounded-lg border bg-background p-3 shadow-sm" data-testid="old-gold-line">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Item bought {index + 1}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground hover:text-destructive"
                onClick={() => onLinesChange(lines.filter((l) => l.key !== line.key))}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Remove
              </Button>
            </div>

            {!isGem && (
            <StonePresenceQuestion
              checked={line.hasStone}
              onChange={(checked) =>
                update(line.key, {
                  hasStone: checked,
                  ...(checked
                    ? {}
                    : {
                        stoneMetalTypeName: "",
                        stoneTypeNames: [],
                        caratWeight: 0,
                        stoneWeightGrams: 0,
                        netStoneWeightTouched: false,
                        stoneRate: 0,
                        stoneCharge: 0,
                        stoneChargeTouched: false,
                      }),
                })
              }
              hint="Stone weight is taken off the gross weight; its value (₹0 if you don't pay for stones) is added to the metal's."
            />
            )}

            {!isGem && line.hasStone && (
              <div className="rounded-md border-2 border-dashed border-emerald-400 bg-emerald-50 p-3">
                <StoneComponentFields
                  metals={metals}
                  origins={origins}
                  onMetalsChange={onMetalsChange}
                  onOriginsChange={onOriginsChange}
                  stoneMetalTypeName={line.stoneMetalTypeName}
                  onStoneChange={(name, typeNames) => update(line.key, { stoneMetalTypeName: name, stoneTypeNames: typeNames })}
                  selectedTypeNames={line.stoneTypeNames}
                  onTypesChange={(names) => update(line.key, { stoneTypeNames: names })}
                  caratWeight={line.caratWeight}
                  onCaratWeightChange={(value) => {
                    const caratWeight = Number(value) || 0
                    update(line.key, {
                      caratWeight,
                      // Same physical stone: its weight follows the carats until typed.
                      ...(line.netStoneWeightTouched ? {} : { stoneWeightGrams: caratWeight * GRAMS_PER_CARAT }),
                    })
                  }}
                  stoneRate={line.stoneRate}
                  onStoneRateChange={(value) => update(line.key, { stoneRate: Number(value) || 0 })}
                  stoneCharge={line.stoneCharge}
                  onStoneChargeChange={(value) =>
                    update(line.key, { stoneCharge: Number(value) || 0, stoneChargeTouched: true })
                  }
                  stoneChargeTouched={line.stoneChargeTouched}
                  stoneWeightInput={
                    line.stoneWeightUnit === "CARAT" ? line.stoneWeightGrams / GRAMS_PER_CARAT : line.stoneWeightGrams
                  }
                  onStoneWeightInputChange={(value) => {
                    const entered = Number(value) || 0
                    update(line.key, {
                      stoneWeightGrams: line.stoneWeightUnit === "CARAT" ? entered * GRAMS_PER_CARAT : entered,
                      netStoneWeightTouched: true,
                    })
                  }}
                  stoneWeightUnit={line.stoneWeightUnit}
                  onStoneWeightUnitChange={(unit) => update(line.key, { stoneWeightUnit: unit })}
                  netStoneWeightTouched={line.netStoneWeightTouched}
                />
              </div>
            )}

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
                  Metal / Stone <RequiredMark />
                </Label>
                <Select
                  value={line.metalTypeId || undefined}
                  onValueChange={(value) => {
                    ensurePurities(value)
                    const gem = Boolean(metalById.get(value)?.isGemstone)
                    update(line.key, {
                      metalTypeId: value,
                      purityLabel: "",
                      purity: "",
                      rate: rateFor(value),
                      // A loose stone is the item itself — no stone-in-metal fields.
                      ...(gem ? { hasStone: false, grossWeight: 0, netWeight: 0, netTouched: false } : { caratWeight: 0 }),
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
                    {gemstones.length > 0 && (
                      <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Loose stones
                      </div>
                    )}
                    {gemstones.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!isGem && (
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
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {isGem ? (
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">
                  Carat Wt (ct) <RequiredMark />
                </Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  data-testid="old-gold-carat"
                  value={line.caratWeight || ""}
                  onChange={(e) => update(line.key, { caratWeight: Number(e.target.value) || 0 })}
                />
              </div>
              ) : (
              <>
              <div className="space-y-1">
                <Label className="text-xs">Gross Wt (g)</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  data-testid="old-gold-gross"
                  value={line.grossWeight || ""}
                  onChange={(e) => update(line.key, { grossWeight: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Net metal Wt (g) <RequiredMark />
                </Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  data-testid="old-gold-net"
                  value={line.netWeight || ""}
                  onChange={(e) => update(line.key, { netWeight: Number(e.target.value) || 0, netTouched: true })}
                />
                {line.hasStone && line.grossWeight > 0 && !line.netTouched ? (
                  <p className="text-[11px] text-muted-foreground">Gross − stone weight</p>
                ) : null}
              </div>
              </>
              )}
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
                  {isGem ? "Rate / ct" : "Pure rate / g (24K / 999)"} <RequiredMark />
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
            </div>

            <dl className="grid grid-cols-2 gap-2 rounded-md bg-amber-500/10 p-2.5 text-sm md:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">{isGem ? "Weight" : "Pure (24K / 999) weight"}</dt>
                <dd className="font-medium" data-testid="old-gold-fine">
                  {isGem ? `${(line.caratWeight || 0).toFixed(3)} ct` : `${fine.toFixed(3)} g`}
                  {line.netWeight > 0 && fineness !== 100 ? (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">@ {fineness}%</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{isGem ? "Stone value" : "Metal value"}</dt>
                <dd className="font-medium">{rupees(metalValue)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Stone in it</dt>
                <dd className="font-medium">{line.hasStone ? rupees(stoneValue) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Item total</dt>
                <dd className="font-semibold" data-testid="old-gold-value">
                  {rupees(total)}
                </dd>
              </div>
            </dl>
          </div>
        )
      })}

      {lines.length > 0 && (
        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
          <span>
            Net metal: <span className="font-medium">{totalNet.toFixed(3)} g</span>
          </span>
          <span>
            Pure (24K / 999): <span className="font-medium">{totalFine.toFixed(3)} g</span>
          </span>
          <span>
            Bought for: <span className="font-semibold">{rupees(totalValue)}</span>
          </span>
        </div>
      )}

      {excess > 0 && (
        <div className="space-y-2 rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
          <p className="font-medium text-emerald-800">
            What you're buying is worth {rupees(excess)} more than the bill. How does the customer want the difference?
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
    </section>
  )
}
