"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import {
  upsertStoreCategoryType,
  type StoreCategoryTypeRow,
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

type AddCategoryTypeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryId: string
  categoryName: string
  /** Called with the newly created Type — see AddCategoryDialog's own
   * comment for why this updates the caller's in-memory list directly
   * rather than navigating or refetching. */
  onCreated: (type: StoreCategoryTypeRow) => void
}

/** Quick "Add Type" — a StoreCategoryType row under one specific Category,
 * via the same upsertStoreCategoryType action Settings -> Taxonomy uses
 * (Admin/Super Admin only, same permission note as AddCategoryDialog). */
export function AddCategoryTypeDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  onCreated,
}: AddCategoryTypeDialogProps) {
  const toast = useToast()
  const [state, formAction, pending] = useActionState(upsertStoreCategoryType, initialState)
  const [name, setName] = useState("")

  useEffect(() => {
    if (!open) setName("")
  }, [open])

  useEffect(() => {
    if (state.success && state.id) {
      toast.success(state.message || "Type added")
      onCreated({ id: state.id, categoryId, name, isActive: true })
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
          <DialogTitle>Add Type for {categoryName}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <input type="hidden" name="categoryId" value={categoryId} />

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="category-type-dialog-name">Name</Label>
            <Input
              id="category-type-dialog-name"
              name="name"
              autoFocus
              placeholder="e.g. Ladies, Gents, Kids"
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
              Add Type
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
