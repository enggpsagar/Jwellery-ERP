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
  // IssueMaterialDialog's identical convention.
  const [receiveWeightGrams, setReceiveWeightGrams] = useState("")

  useEffect(() => {
    setWeightUnit(primaryUnit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalTypeId])

  function displayReceiveWeight() {
    if (receiveWeightGrams.trim() === "" || !Number.isFinite(Number(receiveWeightGrams))) return ""
    return String(toPrimaryUnit(Number(receiveWeightGrams), "GRAM", weightUnit, GRAMS_PER_CARAT))
  }

  function handleReceiveWeightChange(typed: string) {
    if (typed.trim() === "" || !Number.isFinite(Number(typed))) {
      setReceiveWeightGrams("")
      return
    }
    setReceiveWeightGrams(String(toPrimaryUnit(Number(typed), weightUnit, "GRAM", GRAMS_PER_CARAT)))
  }

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

  const receiveMaterialWithId = recordMaterialReceiptFromKarigar.bind(null, karigarId)
  const [state, formAction, pending] = useActionState(receiveMaterialWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Material received")
      setOpen(false)
      setReceiveWeightGrams("")
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
      setReceiveWeightGrams("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Receive Material{typeof count === "number" ? ` (${count})` : ""}
      </Button>

      <DialogContent>
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
          — no open job needed. It only adjusts the karigar's metal ledger; it
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
          <input
            type="hidden"
            name="receiveWeight"
            value={
              receiveWeightGrams.trim() === ""
                ? ""
                : String(toPrimaryUnit(Number(receiveWeightGrams), "GRAM", primaryUnit, GRAMS_PER_CARAT))
            }
          />

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

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Received Weight <RequiredMark /></Label>
            <div className="flex gap-1">
              <Input
                type="number"
                step="any"
                min="0"
                required
                className="flex-1"
                value={displayReceiveWeight()}
                onChange={(event) => handleReceiveWeightChange(event.target.value)}
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
            <Button type="submit" disabled={pending || !metalTypeId}>
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
