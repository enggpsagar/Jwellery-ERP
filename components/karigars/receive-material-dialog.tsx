"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import {
  recordMaterialReceiptFromKarigar,
  type StockActionState,
} from "@/lib/actions/inventory-stock-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { classifyMetalName } from "@/lib/business-units"
import { GRAMS_PER_CARAT, toPrimaryUnit } from "@/lib/purity"
import { LocationSelect } from "@/components/shared/location-select"
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

const PURITY_OPTIONS: { value: string; label: string }[] = [
  { value: "GOLD_24K", label: "Gold 24K" },
  { value: "GOLD_22K", label: "Gold 22K" },
  { value: "GOLD_20K", label: "Gold 20K" },
  { value: "GOLD_18K", label: "Gold 18K" },
  { value: "SILVER_999", label: "Silver 999" },
  { value: "SILVER_925", label: "Silver 925" },
  { value: "PLATINUM_950", label: "Platinum 950" },
  { value: "PLATINUM_900", label: "Platinum 900" },
]

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
  const [receivePurity, setReceivePurity] = useState("GOLD_22K")
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

  const metalFamily = selectedMetal?.name.toLowerCase().includes("platinum")
    ? "PLATINUM"
    : classifyMetalName(selectedMetal?.name)
  const purityOptions = useMemo(() => {
    if (metalFamily === "GOLD") return PURITY_OPTIONS.filter((o) => o.value.startsWith("GOLD_"))
    if (metalFamily === "SILVER") return PURITY_OPTIONS.filter((o) => o.value.startsWith("SILVER_"))
    if (metalFamily === "PLATINUM") return PURITY_OPTIONS.filter((o) => o.value.startsWith("PLATINUM_"))
    return PURITY_OPTIONS
  }, [metalFamily])

  useEffect(() => {
    if (!purityOptions.some((option) => option.value === receivePurity)) {
      setReceivePurity(purityOptions[0]?.value ?? "")
    }
  }, [purityOptions, receivePurity])

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
          {isPreciousMetal && <input type="hidden" name="receivePurity" value={receivePurity} />}
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
                <Select value={receivePurity} onValueChange={setReceivePurity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {purityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
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
                step="0.001"
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
            <Label>Store Location</Label>
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
