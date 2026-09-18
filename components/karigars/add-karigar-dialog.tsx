"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { Loader } from "@/components/ui/loader"

import { createKarigar } from "@/lib/actions/karigar-actions"
import type { KarigarFormState } from "@/lib/actions/karigar-actions"
import type { KarigarOption } from "@/components/karigars/karigar-select"
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

const initialState: KarigarFormState = { success: false, message: "" }

type AddKarigarDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the newly created row once saved, so the caller can add it
   * to its own in-memory list and select it immediately — no page
   * navigation, no refetch, same pattern as AddMetalDialog/AddPurityDialog's
   * own onCreated. */
  onCreated: (karigar: KarigarOption) => void
}

/**
 * Quick "Add Artisan" — creates a Karigar row via the same createKarigar
 * action the full Karigars > New page uses, but with only the two fields
 * (Name, Mobile) actually required to pick one from a KarigarSelect
 * afterwards; everything else (address, KYC, specialization, ...) stays
 * editable later from the Karigars page itself.
 *
 * Triggered by a plain button next to the artisan <Select>, not a
 * SelectItem inside its dropdown — same reasoning as AddMetalDialog's own
 * doc comment (a modal opened from within an open dropdown fights that
 * dropdown's overlay for pointer/focus on touch).
 */
export function AddKarigarDialog({ open, onOpenChange, onCreated }: AddKarigarDialogProps) {
  const toast = useToast()
  const [state, formAction, pending] = useActionState(createKarigar, initialState)
  const [name, setName] = useState("")
  const [mobile, setMobile] = useState("")

  useEffect(() => {
    if (!open) {
      setName("")
      setMobile("")
    }
  }, [open])

  useEffect(() => {
    if (state.success && state.id) {
      toast.success(state.message || "Artisan added")
      onCreated({
        id: state.id,
        name,
        mobile: mobile || null,
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
          <DialogTitle>Add Artisan</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="karigar-dialog-name">Name</Label>
            <Input
              id="karigar-dialog-name"
              name="name"
              autoFocus
              placeholder="Artisan's name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {state.errors?.name && (
              <p className="text-xs text-destructive">{state.errors.name[0]}</p>
            )}
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="karigar-dialog-mobile">Mobile</Label>
            <Input
              id="karigar-dialog-mobile"
              name="mobile"
              placeholder="Optional"
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
            />
            {state.errors?.mobile && (
              <p className="text-xs text-destructive">{state.errors.mobile[0]}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader className="mr-1 h-4 w-4" />}
              Add Artisan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
