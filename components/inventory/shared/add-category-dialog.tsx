"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { Loader } from "@/components/ui/loader"

import { upsertStoreCategory, type StoreCategoryRow, type TaxonomyFormState } from "@/lib/actions/taxonomy-actions"
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

type AddCategoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the newly created Category once saved, so the caller can
   * add it to its own in-memory list and select it immediately — no page
   * navigation, no refetch, since a Product mid-entry would otherwise lose
   * every other field already filled in (this dialog opens mid-form, not
   * from a blank Settings page). Mirrors AddMetalDialog's own reasoning. */
  onCreated: (category: StoreCategoryRow) => void
}

/**
 * Quick "Add Category" — creates a StoreCategory row via the same
 * upsertStoreCategory action Settings -> Taxonomy uses (Admin/Super Admin
 * only; a Staff user opening this gets that action's own permission error
 * as a toast, same as if they'd tried Settings directly).
 *
 * Triggered by a plain button next to the Category <Select>, not a
 * SelectItem inside its dropdown — see AddMetalDialog's own comment for why
 * a modal launched from within an open dropdown fights that dropdown's
 * overlay for pointer/focus on touch devices.
 */
export function AddCategoryDialog({ open, onOpenChange, onCreated }: AddCategoryDialogProps) {
  const toast = useToast()
  const [state, formAction, pending] = useActionState(upsertStoreCategory, initialState)
  const [name, setName] = useState("")

  useEffect(() => {
    if (!open) setName("")
  }, [open])

  useEffect(() => {
    if (state.success && state.id) {
      toast.success(state.message || "Category added")
      onCreated({ id: state.id, name, isActive: true })
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
          <DialogTitle>Add Category</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="category-dialog-name">Name</Label>
            <Input
              id="category-dialog-name"
              name="name"
              autoFocus
              placeholder="e.g. Ring, Necklace, Bangle"
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
              {pending && <Loader className="mr-1 h-4 w-4" />}
              Add Category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
