"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { upsertStoreMetal, type StoreMetalRow, type TaxonomyFormState } from "@/lib/actions/taxonomy-actions"
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

type AddMetalDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the newly created row once saved, so the caller can add it
   * to its own in-memory list and select it immediately — no page
   * navigation, no refetch, since a line item/product mid-entry would
   * otherwise lose everything else already filled in (this dialog is
   * opened mid-form, not from a blank page the way Settings' own taxonomy
   * form is). */
  onCreated: (metal: StoreMetalRow) => void
  /** true creates a Stone (gemstone) row — hides the Has Purity checkbox
   * below and always saves hasPurity=false, matching a gemstone's own
   * pricing model (Stone Carat Weight x Rate, never a fixed purity list).
   * false (default) creates a plain Metal Type row (Gold/Silver/Platinum/
   * ...) and shows the same Has Purity checkbox Settings -> Taxonomy
   * offers, since it directly controls whether the caller's own Default
   * Purity dropdown is enabled for this row afterwards. */
  isGemstone?: boolean
}

/**
 * Quick "Add Stone" / "Add Metal Type" — creates a StoreMetal row via the
 * same upsertStoreMetal action Settings -> Taxonomy uses (Admin/Super Admin
 * only; a Staff user opening this gets that action's own permission error
 * as a toast, same as if they'd tried Settings directly). One component
 * covers both cases (`isGemstone` picks which) since they differ only in
 * title/placeholder and whether Has Purity applies — not worth two
 * near-identical dialogs.
 *
 * Triggered by a plain button next to the Stone/Metal Type <Select>, not a
 * SelectItem inside its dropdown — a modal opened from within an open
 * dropdown fights that dropdown's overlay for pointer/focus on touch
 * devices.
 */
export function AddMetalDialog({ open, onOpenChange, onCreated, isGemstone = false }: AddMetalDialogProps) {
  const toast = useToast()
  const [state, formAction, pending] = useActionState(upsertStoreMetal, initialState)
  const [name, setName] = useState("")
  const [hasPurity, setHasPurity] = useState(false)

  const title = isGemstone ? "Add Stone" : "Add Metal Type"

  useEffect(() => {
    if (!open) {
      setName("")
      setHasPurity(false)
    }
  }, [open])

  useEffect(() => {
    if (state.success && state.id) {
      toast.success(state.message || `${title} added`)
      onCreated({
        id: state.id,
        name,
        hasPurity: isGemstone ? false : hasPurity,
        isActive: true,
        isGemstone,
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          {isGemstone && <input type="hidden" name="isGemstone" value="on" />}

          <div className="space-y-1.5">
            <Label htmlFor="metal-dialog-name">Name</Label>
            <Input
              id="metal-dialog-name"
              name="name"
              autoFocus
              placeholder={isGemstone ? "e.g. Diamond, Ruby, Emerald" : "e.g. Gold, Silver, Platinum"}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {state.errors?.name && (
              <p className="text-xs text-destructive">{state.errors.name[0]}</p>
            )}
          </div>

          {!isGemstone && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="metal-dialog-hasPurity"
                name="hasPurity"
                checked={hasPurity}
                onChange={(event) => setHasPurity(event.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="metal-dialog-hasPurity">Has Purity</Label>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
