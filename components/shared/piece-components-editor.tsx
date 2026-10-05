"use client"

import { Gem, Layers, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { DEFAULT_FINENESS, GRAMS_PER_CARAT, PURITY_SELECT_OPTIONS, matchLegacyPurityType } from "@/lib/purity"
import { classifyPurityFamily } from "@/lib/business-units"
import {
  componentAmount,
  metalRowFine,
  newMetalRow,
  newStoneRow,
  pieceTotals,
  round2,
  round5,
  type PieceComponentDraft,
  type PieceMetalDraft,
  type PieceValuation,
} from "@/lib/piece-components"
import type { GstRateRow } from "@/lib/actions/gst-rate-actions"
import type { StoreMetalOriginRow, StoreMetalPurityRow, StoreMetalRow } from "@/lib/actions/taxonomy-actions"

const rupees = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Fineness % of a metal row — the metal's own purity row, else the
 *  store's per-enum table — same precedence as lib/fine-weight.ts. */
export function metalRowFineness(
  row: PieceMetalDraft,
  purities: StoreMetalPurityRow[] | undefined,
  enumFineness: Record<string, number>,
) {
  const byLabel = row.purityLabel ? purities?.find((p) => p.label === row.purityLabel) : undefined
  if (byLabel) return byLabel.finenessPercent
  if (row.purity) return enumFineness[row.purity] ?? DEFAULT_FINENESS[row.purity as keyof typeof DEFAULT_FINENESS] ?? 100
  return 100
}

type Props = {
  rows: PieceComponentDraft[]
  onRowsChange: (rows: PieceComponentDraft[]) => void
  metals: StoreMetalRow[]
  origins: StoreMetalOriginRow[]
  puritiesByMetal: Record<string, StoreMetalPurityRow[]>
  ensurePurities: (metalTypeId: string) => void
  enumFineness: Record<string, number>
  /** "net": metal valued on net weight × rate (sale / purchase). "fine":
   *  on pure 24K / 999 weight × pure rate (Customer Exchange). */
  valuation: PieceValuation
  /** GST picker per row (sale / purchase). Off for a Customer Exchange. */
  gstRates?: GstRateRow[]
  defaultGstRateId?: string
  /** Prefill for a metal row's rate once its metal is picked. */
  rateForMetal?: (metal: StoreMetalRow) => number
  /** A stock piece's metals/stones are facts from Inventory — only rates
   *  (and GST) stay editable. */
  lockPhysical?: boolean
  /** e.g. "sale" → test ids; purely cosmetic. */
  testIdPrefix?: string
  /** Label of the per-row GST picker — e.g. "GST if billed" on a Kacha
   *  slip, where the rate only applies once it's converted. */
  gstLabel?: string
}

/**
 * The metals and stones of one piece made of several — e.g. Gold 22K +
 * Silver 925 + Diamond — each on its own row with its own purity, weight,
 * rate and (on a sale/purchase) GST rate. Shared by New Invoice lines,
 * Purchase lines and Customer Exchange items (lib/piece-components.ts).
 */
export function PieceComponentsEditor({
  rows,
  onRowsChange,
  metals,
  origins,
  puritiesByMetal,
  ensurePurities,
  enumFineness,
  valuation,
  gstRates,
  defaultGstRateId = "",
  rateForMetal,
  lockPhysical = false,
  testIdPrefix = "piece",
  gstLabel = "GST",
}: Props) {
  const metalById = new Map(metals.map((metal) => [metal.id, metal]))
  const metalChoices = metals.filter((metal) => !metal.isGemstone && (metal.isActive || rows.some((r) => r.kind === "METAL" && r.metalTypeId === metal.id)))
  const stoneChoices = metals.filter((metal) => metal.isGemstone && metal.isActive)
  const showGst = Boolean(gstRates?.length)
  const activeGst = (gstRates ?? []).filter((rate) => rate.isActive || rows.some((r) => r.gstRateId === rate.id))

  const finenessOf = (row: PieceMetalDraft) => metalRowFineness(row, puritiesByMetal[row.metalTypeId], enumFineness)
  const valueOptions = { valuation, finenessOf }
  const totals = pieceTotals(rows, valueOptions)

  const update = (key: string, patch: Partial<PieceComponentDraft>) =>
    onRowsChange(
      rows.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, ...patch } as PieceComponentDraft
        if (next.kind === "METAL" && !next.netTouched && next.grossWeight > 0) next.netWeight = next.grossWeight
        if (next.kind === "STONE") {
          if (!next.stoneWeightTouched) next.stoneWeight = round5((next.caratWeight || 0) * GRAMS_PER_CARAT)
          if (!next.amountTouched) next.amount = round2((next.caratWeight || 0) * (next.rate || 0))
        }
        return next
      }),
    )

  // Per-metal pure weight, e.g. "Gold 7.511 g pure · Silver 2.775 g pure".
  const pureByMetal = new Map<string, number>()
  for (const row of rows) {
    if (row.kind !== "METAL" || !row.metalTypeId) continue
    pureByMetal.set(row.metalTypeId, (pureByMetal.get(row.metalTypeId) ?? 0) + metalRowFine(row, finenessOf))
  }

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-components`}>
      {rows.map((row, index) => {
        const amount = componentAmount(row, valueOptions)
        const gstSelect = showGst ? (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">{gstLabel}</Label>
            <Select value={row.gstRateId || defaultGstRateId || undefined} onValueChange={(value) => update(row.key, { gstRateId: value })}>
              <SelectTrigger className="h-9 w-full bg-background">
                <SelectValue placeholder="GST" />
              </SelectTrigger>
              <SelectContent>
                {activeGst.map((rate) => (
                  <SelectItem key={rate.id} value={rate.id}>
                    {rate.ratePercent}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null

        if (row.kind === "METAL") {
          const metal = metalById.get(row.metalTypeId)
          const purities = (puritiesByMetal[row.metalTypeId] ?? []).filter((p) => p.isActive || p.label === row.purityLabel)
          const family = metal ? classifyPurityFamily(metal) : null
          const legacyOptions = PURITY_SELECT_OPTIONS.filter((option) => (family ? option.value.startsWith(`${family}_`) : false))
          const fine = metalRowFine(row, finenessOf)
          return (
            <div
              key={row.key}
              className="grid grid-cols-2 items-end gap-2 rounded-md border-l-4 border-amber-400 bg-background p-2 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.9fr_0.7fr_1fr_auto]"
              data-testid={`${testIdPrefix}-metal-row`}
            >
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Metal {index + 1}</Label>
                <Select
                  value={row.metalTypeId || undefined}
                  disabled={lockPhysical}
                  onValueChange={(value) => {
                    ensurePurities(value)
                    const picked = metalById.get(value)
                    update(row.key, {
                      metalTypeId: value,
                      purityLabel: "",
                      purity: "",
                      rate: row.rate || (picked && rateForMetal ? rateForMetal(picked) : 0),
                    })
                  }}
                >
                  <SelectTrigger className="h-9 w-full bg-background" data-testid={`${testIdPrefix}-metal`}>
                    <SelectValue placeholder="Metal" />
                  </SelectTrigger>
                  <SelectContent>
                    {metalChoices.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Purity</Label>
                <Select
                  value={row.purityLabel ? `label:${row.purityLabel}` : row.purity ? `enum:${row.purity}` : undefined}
                  disabled={lockPhysical || !row.metalTypeId || (!purities.length && !legacyOptions.length)}
                  onValueChange={(value) => {
                    if (value.startsWith("label:")) {
                      const label = value.slice(6)
                      update(row.key, {
                        purityLabel: label,
                        purity: metal ? matchLegacyPurityType(classifyPurityFamily(metal), label) ?? "" : "",
                      })
                    } else {
                      update(row.key, { purityLabel: "", purity: value.slice(5) })
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-full bg-background" data-testid={`${testIdPrefix}-purity`}>
                    <SelectValue placeholder={metal?.hasPurity === false ? "—" : "Purity"} />
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
                            {option.label}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Gross g</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  readOnly={lockPhysical}
                  className={cn("h-9", lockPhysical && "bg-muted")}
                  data-testid={`${testIdPrefix}-gross`}
                  value={row.grossWeight || ""}
                  onChange={(e) => update(row.key, { grossWeight: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Net g</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  readOnly={lockPhysical}
                  className={cn("h-9", lockPhysical && "bg-muted")}
                  data-testid={`${testIdPrefix}-net`}
                  value={row.netWeight || ""}
                  onChange={(e) => update(row.key, { netWeight: Number(e.target.value) || 0, netTouched: true })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">{valuation === "fine" ? "Pure rate / g" : "Rate / g"}</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  className="h-9"
                  data-testid={`${testIdPrefix}-rate`}
                  placeholder={valuation === "fine" ? "Pure rate" : "₹ / g"}
                  value={row.rate || ""}
                  onChange={(e) => update(row.key, { rate: Number(e.target.value) || 0 })}
                />
              </div>
              {gstSelect ?? <div className="hidden md:block" />}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Value</Label>
                <p className="flex h-9 items-center rounded-md border bg-muted px-2 text-sm font-medium" data-testid={`${testIdPrefix}-row-value`}>
                  {rupees(amount)}
                </p>
                {fine > 0 && fine !== row.netWeight ? (
                  <p className="text-[10px] text-muted-foreground">{fine.toFixed(3)} g pure</p>
                ) : null}
              </div>
              <RemoveButton disabled={lockPhysical} onClick={() => onRowsChange(rows.filter((r) => r.key !== row.key))} />
            </div>
          )
        }

        const stone = stoneChoices.find((s) => s.name === row.stoneMetalTypeName)
        const types = stone ? origins.filter((o) => o.storeMetalId === stone.id && o.isActive) : []
        return (
          <div
            key={row.key}
            className="grid grid-cols-2 items-end gap-2 rounded-md border-l-4 border-emerald-400 bg-background p-2 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.9fr_0.7fr_1fr_auto]"
            data-testid={`${testIdPrefix}-stone-row`}
          >
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Stone</Label>
              <Select
                value={row.stoneMetalTypeName || undefined}
                disabled={lockPhysical}
                onValueChange={(value) => update(row.key, { stoneMetalTypeName: value, stoneTypeNames: [] })}
              >
                <SelectTrigger className="h-9 w-full bg-background" data-testid={`${testIdPrefix}-stone`}>
                  <SelectValue placeholder="Stone" />
                </SelectTrigger>
                <SelectContent>
                  {stoneChoices.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Type</Label>
              <Select
                value={row.stoneTypeNames[0] || undefined}
                disabled={lockPhysical || !types.length}
                onValueChange={(value) => update(row.key, { stoneTypeNames: [value] })}
              >
                <SelectTrigger className="h-9 w-full bg-background">
                  <SelectValue placeholder={types.length ? "Type" : "—"} />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Carats</Label>
              <Input
                type="number"
                step="any"
                min={0}
                readOnly={lockPhysical}
                className={cn("h-9", lockPhysical && "bg-muted")}
                data-testid={`${testIdPrefix}-carat`}
                value={row.caratWeight || ""}
                onChange={(e) => update(row.key, { caratWeight: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Weight g</Label>
              <Input
                type="number"
                step="any"
                min={0}
                readOnly={lockPhysical}
                className={cn("h-9", lockPhysical && "bg-muted")}
                value={row.stoneWeight || ""}
                onChange={(e) => update(row.key, { stoneWeight: Number(e.target.value) || 0, stoneWeightTouched: true })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Rate / ct</Label>
              <Input
                type="number"
                step="any"
                min={0}
                className="h-9"
                data-testid={`${testIdPrefix}-stone-rate`}
                value={row.rate || ""}
                onChange={(e) => update(row.key, { rate: Number(e.target.value) || 0 })}
              />
            </div>
            {gstSelect ?? <div className="hidden md:block" />}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Value</Label>
              <Input
                type="number"
                step="any"
                min={0}
                className="h-9 font-medium"
                data-testid={`${testIdPrefix}-stone-value`}
                value={amount || ""}
                onChange={(e) => update(row.key, { amount: Number(e.target.value) || 0, amountTouched: true })}
              />
            </div>
            <RemoveButton disabled={lockPhysical} onClick={() => onRowsChange(rows.filter((r) => r.key !== row.key))} />
          </div>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {lockPhysical ? (
          <span />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-800 hover:bg-amber-50"
              onClick={() => onRowsChange([...rows, newMetalRow(0, defaultGstRateId)])}
            >
              <Layers className="mr-1 h-4 w-4" />
              Add metal
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-emerald-400 text-emerald-800 hover:bg-emerald-50"
              onClick={() => onRowsChange([...rows, newStoneRow(defaultGstRateId)])}
            >
              <Gem className="mr-1 h-4 w-4" />
              Add stone
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid={`${testIdPrefix}-totals`}>
          {[...pureByMetal.entries()].map(([metalId, pure]) => (
            <span key={metalId}>
              {metalById.get(metalId)?.name ?? "Metal"}: <span className="font-medium text-foreground">{pure.toFixed(3)} g pure</span>
            </span>
          ))}
          {totals.stoneCarats > 0 ? (
            <span>
              Stones: <span className="font-medium text-foreground">{totals.stoneCarats.toFixed(2)} ct</span>
            </span>
          ) : null}
          <span>
            Metals {rupees(totals.metalValue)} + Stones {rupees(totals.stoneValue)} ={" "}
            <span className="font-semibold text-foreground">{rupees(totals.total)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9 justify-self-end text-muted-foreground hover:text-destructive"
      title="Remove row"
      disabled={disabled}
      onClick={onClick}
    >
      <X className="h-4 w-4" />
    </Button>
  )
}
