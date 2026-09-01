"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import {
  issueMaterialToKarigar,
  type StockActionState,
} from "@/lib/actions/inventory-stock-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { classifyMetalName } from "@/lib/business-units"
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
]

type LocationOption = {
  id: string
  name: string
}

type IssueMaterialDialogProps = {
  karigarId: string
  metals: StoreMetalRow[]
  locations?: LocationOption[]
}

export function IssueMaterialDialog({
  karigarId,
  metals,
  locations = [],
}: IssueMaterialDialogProps) {
  const activeMetals = useMemo(() => metals.filter((m) => m.isActive), [metals])
  // Mirrors the old hardcoded default of "GOLD": prefer a hasPurity metal if
  // one exists, otherwise just fall back to whatever is first in the list.
  const defaultMetalId = useMemo(
    () => activeMetals.find((m) => m.hasPurity)?.id ?? activeMetals[0]?.id ?? "",
    [activeMetals],
  )

  const [open, setOpen] = useState(false)
  const [metalTypeId, setMetalTypeId] = useState(defaultMetalId)
  const [issuePurity, setIssuePurity] = useState("GOLD_22K")
  const [locationId, setLocationId] = useState("")
  const router = useRouter()
  const toast = useToast()

  useEffect(() => {
    setMetalTypeId((current) => current || defaultMetalId)
  }, [defaultMetalId])

  const selectedMetal = activeMetals.find((m) => m.id === metalTypeId)
  const isPreciousMetal = selectedMetal?.hasPurity ?? false

  // Purity options depend on which metal is selected — Silver should never
  // offer Gold purities and vice versa. A custom precious metal this codebase
  // doesn't recognize as Gold/Silver (e.g. Platinum) falls back to the full
  // list, since PurityType has no values for it either way.
  const metalFamily = classifyMetalName(selectedMetal?.name)
  const purityOptions = useMemo(() => {
    if (metalFamily === "GOLD") return PURITY_OPTIONS.filter((o) => o.value.startsWith("GOLD_"))
    if (metalFamily === "SILVER") return PURITY_OPTIONS.filter((o) => o.value.startsWith("SILVER_"))
    return PURITY_OPTIONS
  }, [metalFamily])

  // Keep the selected purity valid whenever the metal (and so the available
  // options) changes — e.g. switching Gold -> Silver must not silently submit
  // a leftover "GOLD_22K".
  useEffect(() => {
    if (!purityOptions.some((option) => option.value === issuePurity)) {
      setIssuePurity(purityOptions[0]?.value ?? "")
    }
  }, [purityOptions, issuePurity])

  const issueMaterialWithId = issueMaterialToKarigar.bind(null, karigarId)
  const [state, formAction, pending] = useActionState(issueMaterialWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Material issued")
      setOpen(false)
      router.refresh()
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Issue Material
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue Material to Karigar</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="metalTypeId" value={metalTypeId} />
          {isPreciousMetal && <input type="hidden" name="issuePurity" value={issuePurity} />}

          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
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
              <div className="space-y-2">
                <Label>Purity</Label>
                <Select value={issuePurity} onValueChange={setIssuePurity}>
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

          <div className="space-y-2">
            <Label>Issue Weight (g) <RequiredMark /></Label>
            <Input name="issueWeight" type="number" step="0.001" min="0" required />
          </div>

          <div className="space-y-2">
            <Label>Expected Return Date</Label>
            <Input name="expectedDate" type="date" />
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            <LocationSelect
              locations={locations}
              name="locationId"
              defaultValue={locationId}
              onChange={setLocationId}
            />
          </div>

          <div className="space-y-2">
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
                  ? "Optional notes"
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
              {pending ? "Issuing..." : "Issue Material"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
