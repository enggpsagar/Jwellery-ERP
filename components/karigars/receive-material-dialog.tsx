"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import {
  recordMaterialReceiptFromKarigar,
  type StockActionState,
} from "@/lib/actions/inventory-stock-actions"
import { getStoreMetalPurities, type StoreMetalRow, type StoreMetalPurityRow } from "@/lib/actions/taxonomy-actions"
import { GRAMS_PER_CARAT, toPrimaryUnit } from "@/lib/purity"
import { LocationSelect, useShowLocationField } from "@/components/shared/location-select"
import { useToast } from "@/components/providers/toast-provider"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: StockActionState = { success: false, message: "" }

type LocationOption = {
  id: string
  name: string
}

type ReceiveMaterialDialogProps = {
  karigarId: string
  metals: StoreMetalRow[]
  /** Which metals/stones this karigar is actually assigned to work with —
   * same gate as IssueMaterialDialog's own assignedMetalTypeIds prop. */
  assignedMetalTypeIds: string[]
  locations?: LocationOption[]
  defaultLocationId?: string | null
  /** Total Receive Material entries recorded for this karigar so far —
   * shown as a "(n)" suffix on the trigger button. */
  count?: number
}

/**
 * Standalone counterpart to IssueMaterialDialog — records material coming
 * back from a karigar without requiring an open KarigarJob, so an
 * outstanding balance from a past/historical transaction (or an opening
 * balance) can still be settled even when nothing is currently "issued and
 * awaiting receipt". See recordMaterialReceiptFromKarigar's doc comment.
 */
export function ReceiveMaterialDialog({
  karigarId,
  metals,
  assignedMetalTypeIds,
  locations = [],
  defaultLocationId = null,
  count,
}: ReceiveMaterialDialogProps) {
  const showLocationField = useShowLocationField(locations.length)
  const activeMetals = useMemo(
    () => metals.filter((m) => m.isActive && assignedMetalTypeIds.includes(m.id)),
    [metals, assignedMetalTypeIds],
  )
  const defaultMetalId = useMemo(
    () => activeMetals.find((m) => m.hasPurity)?.id ?? activeMetals[0]?.id ?? "",
    [activeMetals],
  )

  const [open, setOpen] = useState(false)
  const [metalTypeId, setMetalTypeId] = useState(defaultMetalId)
  const [receiveStoreMetalPurityId, setReceiveStoreMetalPurityId] = useState("")
  const [metalPurities, setMetalPurities] = useState<StoreMetalPurityRow[]>([])
  const [locationId, setLocationId] = useState(defaultLocationId ?? "")
  const router = useRouter()
  const toast = useToast()

  useEffect(() => {
    setMetalTypeId((current) => current || defaultMetalId)
  }, [defaultMetalId])

  const selectedMetal = activeMetals.find((m) => m.id === metalTypeId)
  const isPreciousMetal = selectedMetal?.hasPurity ?? false

  // The selected metal's configured Primary Unit (Settings > Taxonomy) —
  // what Received Weight is actually persisted in, regardless of which
  // unit the toggle is currently showing for entry convenience. No store-
  // specific gram/carat rate is threaded into this dialog, so this uses
  // the universal 1 ct = 0.2 g constant, same fallback lib/purity.ts's own
  // helpers use when a caller hasn't threaded a store rate through.
  const primaryUnit = selectedMetal?.primaryUnit ?? "GRAM"
  const [weightUnit, setWeightUnit] = useState<"GRAM" | "CARAT">(primaryUnit)
  // Always grams internally, regardless of weightUnit — see
  // IssueMaterialDialog's identical convention. Gross and Less share the
  // one unit toggle; Net is derived from them, never typed.
  const [grossWeightGrams, setGrossWeightGrams] = useState("")
  const [lessWeightGrams, setLessWeightGrams] = useState("")
  const [wastagePercent, setWastagePercent] = useState("")
  const [makingCharge, setMakingCharge] = useState("")
  const [makingChargeMode, setMakingChargeMode] = useState<"FIXED" | "PER_GRAM">("FIXED")

  useEffect(() => {
    setWeightUnit(primaryUnit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalTypeId])

  function toDisplayUnit(grams: string) {
    if (grams.trim() === "" || !Number.isFinite(Number(grams))) return ""
    return String(toPrimaryUnit(Number(grams), "GRAM", weightUnit, GRAMS_PER_CARAT))
  }

  function fromTypedUnit(typed: string) {
    if (typed.trim() === "" || !Number.isFinite(Number(typed))) return ""
    return String(toPrimaryUnit(Number(typed), weightUnit, "GRAM", GRAMS_PER_CARAT))
  }

  /** Grams → the metal's persisted Primary Unit, for the hidden inputs. */
  function toPersistedUnit(grams: string) {
    if (grams.trim() === "" || !Number.isFinite(Number(grams))) return ""
    return String(toPrimaryUnit(Number(grams), "GRAM", primaryUnit, GRAMS_PER_CARAT))
  }

  // Live preview only — recordMaterialReceiptFromKarigar recomputes every
  // one of these from the submitted gross/less/wastage/making figures.
  const grossGrams = Number(grossWeightGrams) || 0
  const lessGrams = Number(lessWeightGrams) || 0
  const netGrams = Math.max(0, grossGrams - lessGrams)
  const lessTooHigh = lessGrams > 0 && lessGrams >= grossGrams
  const selectedPurity = metalPurities.find((option) => option.id === receiveStoreMetalPurityId)
  const baseGrams =
    isPreciousMetal && selectedPurity ? (netGrams * selectedPurity.finenessPercent) / 100 : netGrams
  const wastageGrams = (baseGrams * (Number(wastagePercent) || 0)) / 100
  const creditedGrams = baseGrams + wastageGrams
  const makingChargeTotal =
    makingChargeMode === "PER_GRAM"
      ? (Number(makingCharge) || 0) * toPrimaryUnit(netGrams, "GRAM", primaryUnit, GRAMS_PER_CARAT)
      : Number(makingCharge) || 0
  const unitLabel = weightUnit === "CARAT" ? "ct" : "g"
  const showWeight = (grams: number) =>
    `${toPrimaryUnit(grams, "GRAM", weightUnit, GRAMS_PER_CARAT).toFixed(3)}${unitLabel}`

  // Real per-Metal Purity options (Settings > Taxonomy > Purities),
  // replacing the old hardcoded PURITY_OPTIONS list — fetched for whichever
  // metal is currently selected.
  useEffect(() => {
    let cancelled = false
    setReceiveStoreMetalPurityId("")
    if (!metalTypeId) {
      setMetalPurities([])
      return
    }
    getStoreMetalPurities(metalTypeId)
      .then((data) => {
        if (!cancelled) setMetalPurities(data)
      })
      .catch((err) => console.error("Failed to load purities:", err))
    return () => {
      cancelled = true
    }
  }, [metalTypeId])

  function resetWeighing() {
    setGrossWeightGrams("")
    setLessWeightGrams("")
    setWastagePercent("")
    setMakingCharge("")
    setMakingChargeMode("FIXED")
  }

  const receiveMaterialWithId = recordMaterialReceiptFromKarigar.bind(null, karigarId)
  const [state, formAction, pending] = useActionState(receiveMaterialWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Material received")
      setOpen(false)
      resetWeighing()
      router.refresh()
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    if (open) {
      setMetalTypeId(defaultMetalId)
      setLocationId(defaultLocationId ?? "")
      resetWeighing()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Receive Material{typeof count === "number" ? ` (${count})` : ""}
      </Button>

      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Material from Artisan</DialogTitle>
        </DialogHeader>

        {activeMetals.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This artisan has no metals/stones assigned yet. Assign at least one
              before receiving material.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Link href={`/karigars/${karigarId}/edit`}>
                <Button type="button">Edit Artisan</Button>
              </Link>
            </DialogFooter>
          </div>
        ) : (
        <>
        <p className="text-sm text-muted-foreground">
          Use this to record material handed back against an outstanding balance
          — no open job needed. It adjusts the karigar's metal ledger (net weight
          plus wastage) and adds any making charge to their cash balance; it
          won't create new inventory stock.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <input type="hidden" name="metalTypeId" value={metalTypeId} />
          {isPreciousMetal && (
            <input type="hidden" name="receiveStoreMetalPurityId" value={receiveStoreMetalPurityId} />
          )}
          <input type="hidden" name="grossWeight" value={toPersistedUnit(grossWeightGrams)} />
          <input type="hidden" name="lessWeight" value={toPersistedUnit(lessWeightGrams)} />
          <input type="hidden" name="wastagePercent" value={wastagePercent} />
          <input type="hidden" name="makingCharge" value={makingCharge} />
          <input type="hidden" name="makingChargeMode" value={makingChargeMode} />

          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Metal Type <RequiredMark /></Label>
              <Select value={metalTypeId} onValueChange={setMetalTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select metal" />
                </SelectTrigger>
                <SelectContent>
                  {activeMetals.map((metal) => (
                    <SelectItem key={metal.id} value={metal.id}>
                      {metal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isPreciousMetal && (
              <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label>Purity</Label>
                <Select value={receiveStoreMetalPurityId} onValueChange={setReceiveStoreMetalPurityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select purity" />
                  </SelectTrigger>
                  <SelectContent>
                    {metalPurities.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Gross Weight <RequiredMark /></Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  required
                  className="flex-1"
                  value={toDisplayUnit(grossWeightGrams)}
                  onChange={(event) => setGrossWeightGrams(fromTypedUnit(event.target.value))}
                />
                <Select value={weightUnit} onValueChange={(unit) => setWeightUnit(unit as "GRAM" | "CARAT")}>
                  <SelectTrigger className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GRAM">g</SelectItem>
                    <SelectItem value="CARAT">ct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Less Weight ({unitLabel})</Label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Stone / impurity"
                value={toDisplayUnit(lessWeightGrams)}
                onChange={(event) => setLessWeightGrams(fromTypedUnit(event.target.value))}
              />
              {lessTooHigh && (
                <p className="text-xs text-destructive">Must be below the gross weight</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Net Weight ({unitLabel})</Label>
              <Input readOnly tabIndex={-1} className="bg-muted" value={grossGrams > 0 ? showWeight(netGrams) : ""} />
            </div>

            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Wastage %</Label>
              <Input
                type="number"
                step="any"
                min="0"
                max="100"
                value={wastagePercent}
                onChange={(event) => setWastagePercent(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <div className="flex items-center justify-between">
              <Label>Making Charge (₹{makingChargeMode === "PER_GRAM" ? `/${primaryUnit === "CARAT" ? "ct" : "g"}` : ""})</Label>
              <div className="flex rounded-md border p-0.5 text-xs">
                {(["FIXED", "PER_GRAM"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMakingChargeMode(mode)}
                    className={`rounded px-2 py-0.5 ${makingChargeMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {mode === "FIXED" ? "₹ Total" : `Per ${primaryUnit === "CARAT" ? "ct" : "g"}`}
                  </button>
                ))}
              </div>
            </div>
            <Input
              type="number"
              step="any"
              min="0"
              value={makingCharge}
              onChange={(event) => setMakingCharge(event.target.value)}
            />
          </div>

          {grossGrams > 0 && (
            <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span>Net Weight</span>
                <span>{showWeight(netGrams)}</span>
              </div>
              {isPreciousMetal && selectedPurity && (
                <div className="flex justify-between">
                  <span>Fine Weight ({selectedPurity.finenessPercent}%)</span>
                  <span>{showWeight(baseGrams)}</span>
                </div>
              )}
              {wastageGrams > 0 && (
                <div className="flex justify-between">
                  <span>Wastage ({wastagePercent}%)</span>
                  <span>+{showWeight(wastageGrams)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>{isPreciousMetal && selectedPurity ? "Fine credited to artisan" : "Credited to artisan"}</span>
                <span>{showWeight(creditedGrams)}</span>
              </div>
              {makingChargeTotal > 0 && (
                <div className="flex justify-between">
                  <span>Making Charge (owed to artisan)</span>
                  <span>₹{makingChargeTotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            {showLocationField && <Label>Store Location</Label>}
            <LocationSelect
              locations={locations}
              name="locationId"
              defaultValue={locationId}
              onChange={setLocationId}
            />
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>{isPreciousMetal ? (
              "Notes"
            ) : (
              <>
                Material Description <RequiredMark />
              </>
            )}</Label>
            <Textarea
              name="notes"
              rows={2}
              placeholder={
                isPreciousMetal
                  ? "Optional — e.g. Settling balance from before this job's records began"
                  : "Describe the material — e.g. Diamond, 2ct loose stones"
              }
              required={!isPreciousMetal}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !metalTypeId || lessTooHigh}>
              {pending ? "Recording..." : "Receive Material"}
            </Button>
          </DialogFooter>
        </form>
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}
