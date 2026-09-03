"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import {
  upsertStoreMetalOrigin,
  type StoreMetalOriginRow,
  type TaxonomyFormState,
} from "@/lib/actions/taxonomy-actions"
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

type AddStoneTypeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeMetalId: string
  storeMetalName: string
  /** Called with the newly created Stone Type — see AddStoneDialog's own
   * comment for why this updates the caller's in-memory list directly
   * rather than navigating or refetching. */
  onCreated: (origin: StoreMetalOriginRow) => void
}

/** Quick "Add Stone Type" — a StoreMetalOrigin row under one specific
 * Stone, via the same upsertStoreMetalOrigin action Settings → Taxonomy
 * uses (Admin/Super Admin only, same permission note as AddStoneDialog). */
export function AddStoneTypeDialog({
  open,
  onOpenChange,
  storeMetalId,
  storeMetalName,
  onCreated,
}: AddStoneTypeDialogProps) {
  const toast = useToast()
  const [state, formAction, pending] = useActionState(upsertStoreMetalOrigin, initialState)
  const [name, setName] = useState("")

  useEffect(() => {
    if (!open) setName("")
  }, [open])

  useEffect(() => {
    if (state.success && state.id) {
      toast.success(state.message || "Stone Type added")
      onCreated({ id: state.id, storeMetalId, name, isActive: true })
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
          <DialogTitle>Add Stone Type for {storeMetalName}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <input type="hidden" name="storeMetalId" value={storeMetalId} />

          <div className="space-y-1.5">
            <Label htmlFor="stone-type-name">Name</Label>
            <Input
              id="stone-type-name"
              name="name"
              autoFocus
              placeholder="e.g. Natural, Lab-Grown, Moissanite"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {state.errors?.name && (
              <p className="text-xs text-destructive">{state.errors.name[0]}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Add Stone Type
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
