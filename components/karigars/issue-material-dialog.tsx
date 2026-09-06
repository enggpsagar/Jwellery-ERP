"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus } from "lucide-react"

import {
  issueMaterialToKarigar,
  type StockActionState,
} from "@/lib/actions/inventory-stock-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { classifyMetalName } from "@/lib/business-units"
import { GRAMS_PER_CARAT, toPrimaryUnit } from "@/lib/purity"
import { todayForDateInput } from "@/lib/date-input"
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

type IssueMaterialDialogProps = {
  karigarId: string
  metals: StoreMetalRow[]
  /** Which metals/stones this karigar is actually assigned to work with
   * (Karigar.assignedMetalTypeIds) — the picker below only ever offers
   * these, matching issueMaterialToKarigar's own server-side gate. */
  assignedMetalTypeIds: string[]
  locations?: LocationOption[]
  /** Store's default location — pre-fills the Location field, since issuing
   * material creates a brand-new issue record (a create, not an edit
   * against something with a fixed location). */
  defaultLocationId?: string | null
  /** Total Issue Material entries recorded for this karigar so far — shown
   * as a "(n)" suffix on the trigger button. Omitted entirely (no "(0)")
   * when not passed, so call sites that don't have the count handy still
   * render a normal button. Ignored for the "icon" trigger. */
  count?: number
  /** "button" (default) is the full labeled trigger used on the Karigar
   * Detail page's header. "icon" is a compact icon-only trigger for the
   * Karigars list's row actions, matching that row's other icon buttons
   * (KarigarRowActions) — same dialog and form either way. */
  trigger?: "button" | "icon"
}

export function IssueMaterialDialog({
  karigarId,
  metals,
  assignedMetalTypeIds,
  locations = [],
  defaultLocationId = null,
  count,
  trigger = "button",
}: IssueMaterialDialogProps) {
  const activeMetals = useMemo(
    () => metals.filter((m) => m.isActive && assignedMetalTypeIds.includes(m.id)),
    [metals, assignedMetalTypeIds],
  )
  // Mirrors the old hardcoded default of "GOLD": prefer a hasPurity metal if
  // one exists, otherwise just fall back to whatever is first in the list.
  const defaultMetalId = useMemo(
    () => activeMetals.find((m) => m.hasPurity)?.id ?? activeMetals[0]?.id ?? "",
    [activeMetals],
  )

  const [open, setOpen] = useState(false)
  const [metalTypeId, setMetalTypeId] = useState(defaultMetalId)
  const [issuePurity, setIssuePurity] = useState("GOLD_22K")
  const [locationId, setLocationId] = useState(defaultLocationId ?? "")
  const router = useRouter()
  const toast = useToast()

  useEffect(() => {
    setMetalTypeId((current) => current || defaultMetalId)
  }, [defaultMetalId])

  const selectedMetal = activeMetals.find((m) => m.id === metalTypeId)
  const isPreciousMetal = selectedMetal?.hasPurity ?? false

  // The selected metal's configured Primary Unit (Settings > Taxonomy) —
  // what Issue Weight is actually persisted in, regardless of which unit
  // the toggle is currently showing for entry convenience. No store-
  // specific gram/carat rate is threaded into this dialog (would mean
  // plumbing it through every caller for a rare case), so this uses the
  // universal 1 ct = 0.2 g constant, same fallback lib/purity.ts's own
  // helpers use when a caller hasn't threaded a store rate through.
  const primaryUnit = selectedMetal?.primaryUnit ?? "GRAM"
  const [weightUnit, setWeightUnit] = useState<"GRAM" | "CARAT">(primaryUnit)
  // Always grams internally, regardless of weightUnit — that only picks
  // what's displayed/typed (converted via toPrimaryUnit on the way in and
  // out) and what unit gets submitted (converted to the metal's actual
  // Primary Unit at submit, not necessarily this toggle).
  const [issueWeightGrams, setIssueWeightGrams] = useState("")

  useEffect(() => {
    setWeightUnit(primaryUnit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalTypeId])

  function displayIssueWeight() {
    if (issueWeightGrams.trim() === "" || !Number.isFinite(Number(issueWeightGrams))) return ""
    return String(toPrimaryUnit(Number(issueWeightGrams), "GRAM", weightUnit, GRAMS_PER_CARAT))
  }

  function handleIssueWeightChange(typed: string) {
    if (typed.trim() === "" || !Number.isFinite(Number(typed))) {
      setIssueWeightGrams("")
      return
    }
    setIssueWeightGrams(String(toPrimaryUnit(Number(typed), weightUnit, "GRAM", GRAMS_PER_CARAT)))
  }

  // Purity options depend on which metal is selected — Silver should never
  // offer Gold purities and vice versa. classifyMetalName's own return type
  // (GOLD | SILVER | DIAMOND | OTHER) has no Platinum bucket, so Platinum is
  // matched separately by name here rather than widening that shared
  // classifier (see the same reasoning in product-form.tsx).
  const metalFamily = selectedMetal?.name.toLowerCase().includes("platinum")
    ? "PLATINUM"
    : classifyMetalName(selectedMetal?.name)
  const purityOptions = useMemo(() => {
    if (metalFamily === "GOLD") return PURITY_OPTIONS.filter((o) => o.value.startsWith("GOLD_"))
    if (metalFamily === "SILVER") return PURITY_OPTIONS.filter((o) => o.value.startsWith("SILVER_"))
    if (metalFamily === "PLATINUM") return PURITY_OPTIONS.filter((o) => o.value.startsWith("PLATINUM_"))
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
      setIssueWeightGrams("")
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
        Issue Material{typeof count === "number" ? ` (${count})` : ""}
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue Material to Artisan</DialogTitle>
        </DialogHeader>

        {activeMetals.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This artisan has no metals/stones assigned yet. Assign at least one
              before issuing material.
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
        <form
          onSubmit={(event) => {
            // Deliberately not `action={formAction}` directly on the form:
            // React resets a form's uncontrolled fields once an action-bound
            // submission settles, regardless of whether the action's own
            // returned state says success or failure — so a plain validation
            // error wiped every other field the user had already typed.
            // Calling the same dispatcher by hand from a prevented submit
            // sidesteps that auto-reset while keeping identical pending/error-
            // state behavior.
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <input type="hidden" name="metalTypeId" value={metalTypeId} />
          <input
            type="hidden"
            name="issueWeight"
            value={
              issueWeightGrams.trim() === ""
                ? ""
                : String(toPrimaryUnit(Number(issueWeightGrams), "GRAM", primaryUnit, GRAMS_PER_CARAT))
            }
          />
          {isPreciousMetal && <input type="hidden" name="issuePurity" value={issuePurity} />}

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

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Issue Weight <RequiredMark /></Label>
            <div className="flex gap-1">
              <Input
                type="number"
                step="0.001"
                min="0"
                required
                className="flex-1"
                value={displayIssueWeight()}
                onChange={(event) => handleIssueWeightChange(event.target.value)}
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
            <Label>Expected Return Date</Label>
            <Input name="expectedDate" type="date" min={todayForDateInput()} />
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Location</Label>
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
        )}
      </DialogContent>
    </Dialog>
  )
}
