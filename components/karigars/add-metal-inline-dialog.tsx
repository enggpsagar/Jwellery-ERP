"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { Plus } from "lucide-react"

import { upsertStoreMetal, type TaxonomyFormState } from "@/lib/actions/taxonomy-actions"
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

type NewMetal = {
  id: string
  name: string
  hasPurity: boolean
  isActive: boolean
  isGemstone: boolean
  primaryUnit: "GRAM" | "CARAT"
  sellingPrice: number | null
}

type AddMetalInlineDialogProps = {
  onCreated: (metal: NewMetal) => void
  /**
   * Launched from the Metals box vs the Stones box already says which
   * category the new row is — pre-sets isGemstone to match and hides the
   * "This is a stone, not a metal" checkbox so the two boxes' own Add
   * buttons can't accidentally create a row in the wrong list. Omit for
   * the old single-button, pick-either-category behavior.
   */
  category?: "metal" | "stone"
  /** Defaults to "Add New Metal/Stone" — pass "Add Metal"/"Add Stone" from
   * each box's own button so the two don't read identically. */
  triggerLabel?: string
}

/**
 * Lets "Assigned Metals/Stones" on the Karigar form create a brand-new
 * StoreMetal on the spot, for the case where the metal/stone a karigar
 * needs isn't in the store's Taxonomy list yet — the alternative would be
 * abandoning this form, going to Settings > Taxonomy, adding it there, and
 * coming back. Same upsertStoreMetal action Settings itself uses (still
 * restricted to Admin/Super Admin there — a non-admin submitting this gets
 * that same rejection back as a plain error message).
 */
export function AddMetalInlineDialog({ onCreated, category, triggerLabel }: AddMetalInlineDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [hasPurity, setHasPurity] = useState(false)
  const [isGemstone, setIsGemstone] = useState(category === "stone")
  const toast = useToast()

  const [state, formAction, pending] = useActionState(upsertStoreMetal, initialState)

  useEffect(() => {
    if (state.success && state.id) {
      onCreated({
        id: state.id,
        name,
        hasPurity,
        isActive: true,
        isGemstone,
        // Matches upsertStoreMetal's own default when this dialog doesn't
        // send a primaryUnit field at all.
        primaryUnit: isGemstone ? "CARAT" : "GRAM",
        // This dialog doesn't ask for a Selling Price — that's set later,
        // per metal, in Settings > Taxonomy.
        sellingPrice: null,
      })
      toast.success(state.message || "Added")
      setOpen(false)
      setName("")
      setHasPurity(false)
      setIsGemstone(category === "stone")
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" />
        {triggerLabel ?? "Add New Metal/Stone"}
      </button>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {category === "stone" ? "Add Stone" : category === "metal" ? "Add Metal" : "Add Metal/Stone"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rose Gold, Ruby"
              required
              autoFocus
            />
          </div>

          {category ? (
            // Category already fixed by which box this dialog was opened
            // from — still submitted as a hidden field, just not editable.
            <input type="hidden" name="isGemstone" value={isGemstone ? "on" : ""} />
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="add-metal-is-gemstone"
                name="isGemstone"
                checked={isGemstone}
                onChange={(e) => setIsGemstone(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="add-metal-is-gemstone">This is a stone, not a metal</Label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="add-metal-has-purity"
              name="hasPurity"
              checked={hasPurity}
              onChange={(e) => setHasPurity(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="add-metal-has-purity">Tracked by purity (e.g. 22K, 999)</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
