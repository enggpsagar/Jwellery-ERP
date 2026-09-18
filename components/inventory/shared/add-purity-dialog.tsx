"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { Loader } from "@/components/ui/loader"

import { upsertStoreMetalPurity, type StoreMetalPurityRow, type TaxonomyFormState } from "@/lib/actions/taxonomy-actions"
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

const initialState: TaxonomyFormState = { success: false, message: "" }

type AddPurityDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which Metal this Purity belongs to — fixed by whatever the caller's own
   * Metal Type field already has selected, not user-editable here (same
   * reasoning a Purity picker itself is scoped/disabled until a Metal is
   * chosen first). */
  storeMetalId: string
  /** Called with the newly created row once saved, so the caller can add it
   * to its own in-memory list and select it immediately — no page
   * navigation, no refetch, same pattern as AddMetalDialog's own
   * onCreated. */
  onCreated: (purity: StoreMetalPurityRow) => void
}

/**
 * Quick "Add Purity" — creates a StoreMetalPurity row via the same
 * upsertStoreMetalPurity action Settings -> Taxonomy -> Purities uses
 * (Admin/Super Admin only). Triggered by a plain button next to the Purity
 * <Select>, not a SelectItem inside its dropdown — same reasoning as
 * AddMetalDialog's own doc comment (a modal opened from within an open
 * dropdown fights that dropdown's overlay for pointer/focus on touch).
 */
export function AddPurityDialog({ open, onOpenChange, storeMetalId, onCreated }: AddPurityDialogProps) {
  const toast = useToast()
  const [state, formAction, pending] = useActionState(upsertStoreMetalPurity, initialState)
  const [label, setLabel] = useState("")
  const [skuCode, setSkuCode] = useState("")
  const [finenessPercent, setFinenessPercent] = useState("100")
  const [sellingPrice, setSellingPrice] = useState("")
  const [isHallmarkable, setIsHallmarkable] = useState(false)

  useEffect(() => {
    if (!open) {
      setLabel("")
      setSkuCode("")
      setFinenessPercent("100")
      setSellingPrice("")
      setIsHallmarkable(false)
    }
  }, [open])

  useEffect(() => {
    if (state.success && state.id) {
      toast.success(state.message || "Purity added")
      onCreated({
        id: state.id,
        storeMetalId,
        label,
        skuCode,
        finenessPercent: Number(finenessPercent) || 100,
        sellingPrice: sellingPrice ? Number(sellingPrice) : null,
        isHallmarkable,
        sortOrder: 0,
        isActive: true,
      })
      onOpenChange(false)
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Purity</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <input type="hidden" name="storeMetalId" value={storeMetalId} />
          <input type="hidden" name="isHallmarkable" value={isHallmarkable ? "true" : "false"} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label htmlFor="purity-dialog-label">Label</Label>
              <Input
                id="purity-dialog-label"
                name="label"
                autoFocus
                placeholder="e.g. 22K"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
              {state.errors?.label && (
                <p className="text-xs text-destructive">{state.errors.label[0]}</p>
              )}
            </div>

            <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label htmlFor="purity-dialog-sku">SKU Code</Label>
              <Input
                id="purity-dialog-sku"
                name="skuCode"
                placeholder="e.g. 22"
                value={skuCode}
                onChange={(event) => setSkuCode(event.target.value)}
              />
              {state.errors?.skuCode && (
                <p className="text-xs text-destructive">{state.errors.skuCode[0]}</p>
              )}
            </div>

            <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label htmlFor="purity-dialog-fineness">Fineness %</Label>
              <Input
                id="purity-dialog-fineness"
                name="finenessPercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={finenessPercent}
                onChange={(event) => setFinenessPercent(event.target.value)}
              />
              {state.errors?.finenessPercent && (
                <p className="text-xs text-destructive">{state.errors.finenessPercent[0]}</p>
              )}
            </div>

            <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label htmlFor="purity-dialog-rate">Selling Price</Label>
              <Input
                id="purity-dialog-rate"
                name="sellingPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="Optional"
                value={sellingPrice}
                onChange={(event) => setSellingPrice(event.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isHallmarkable}
              onChange={(event) => setIsHallmarkable(event.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Hallmarkable
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !label.trim() || !skuCode.trim()}>
              {pending && <Loader className="mr-1 h-4 w-4" />}
              Add Purity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
