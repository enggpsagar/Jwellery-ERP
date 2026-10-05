"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { Loader } from "@/components/ui/loader"

import {
  upsertStoreStoneClarity,
  type StoreStoneClarityRow,
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

type AddClarityDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (clarity: StoreStoneClarityRow) => void
}

/** Quick "Add Clarity" from a product stone row, via the same action
 * Settings → Taxonomy uses (Admin/Super Admin only). */
export function AddClarityDialog({
  open,
  onOpenChange,
  onCreated,
}: AddClarityDialogProps) {
  const toast = useToast()
  const [state, formAction, pending] = useActionState(upsertStoreStoneClarity, initialState)
  const [name, setName] = useState("")

  useEffect(() => {
    if (!open) setName("")
  }, [open])

  useEffect(() => {
    if (state.success && state.id) {
      toast.success(state.message || "Clarity added")
      onCreated({ id: state.id, name: name.trim(), isActive: true })
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
          <DialogTitle>Add Clarity</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="clarity-name">Name</Label>
            <Input
              id="clarity-name"
              name="name"
              autoFocus
              placeholder="e.g. FG/VVS-VS"
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
              Add Clarity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
