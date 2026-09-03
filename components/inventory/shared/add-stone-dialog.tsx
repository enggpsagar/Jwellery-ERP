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

type AddStoneDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the newly created Stone once saved, so the caller can add
   * it to its own in-memory list and select it immediately — no page
   * navigation, no refetch, since a line item's in-progress entries would
   * otherwise be lost (this dialog is opened mid-invoice, not from a blank
   * page the way Settings' own taxonomy form is). */
  onCreated: (stone: StoreMetalRow) => void
}

/**
 * Quick "Add Stone" — creates a StoreMetal row with isGemstone=true via the
 * same upsertStoreMetal action Settings → Taxonomy uses (Admin/Super Admin
 * only; a Staff user opening this gets that action's own permission error
 * as a toast, same as if they'd tried Settings directly).
 *
 * Triggered by a plain button next to the Stone <Select>, not a SelectItem
 * inside its dropdown — CustomerSelect's own comment explains why a modal
 * launched from within an open dropdown fights that dropdown's overlay for
 * pointer/focus on touch devices.
 */
export function AddStoneDialog({ open, onOpenChange, onCreated }: AddStoneDialogProps) {
  const toast = useToast()
  const [state, formAction, pending] = useActionState(upsertStoreMetal, initialState)
  const [name, setName] = useState("")

  useEffect(() => {
    if (!open) setName("")
  }, [open])

  useEffect(() => {
    if (state.success && state.id) {
      toast.success(state.message || "Stone added")
      onCreated({ id: state.id, name, hasPurity: false, isActive: true, isGemstone: true })
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
          <DialogTitle>Add Stone</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <input type="hidden" name="isGemstone" value="on" />

          <div className="space-y-1.5">
            <Label htmlFor="stone-name">Name</Label>
            <Input
              id="stone-name"
              name="name"
              autoFocus
              placeholder="e.g. Diamond, Ruby, Emerald"
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
              Add Stone
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
