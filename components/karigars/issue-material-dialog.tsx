"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import {
  issueMaterialToKarigar,
  type StockActionState,
} from "@/lib/actions/inventory-stock-actions"
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

const initialState: StockActionState = { success: false, message: "" }

const METAL_OPTIONS = ["GOLD", "SILVER", "OTHER"] as const

const PURITY_OPTIONS: { value: string; label: string }[] = [
  { value: "GOLD_24K", label: "Gold 24K" },
  { value: "GOLD_22K", label: "Gold 22K" },
  { value: "GOLD_20K", label: "Gold 20K" },
  { value: "GOLD_18K", label: "Gold 18K" },
  { value: "SILVER_999", label: "Silver 999" },
  { value: "SILVER_925", label: "Silver 925" },
]

type IssueMaterialDialogProps = {
  karigarId: string
}

export function IssueMaterialDialog({ karigarId }: IssueMaterialDialogProps) {
  const [open, setOpen] = useState(false)
  const [metalType, setMetalType] = useState("GOLD")
  const [issuePurity, setIssuePurity] = useState("GOLD_22K")
  const router = useRouter()
  const toast = useToast()

  const isPreciousMetal = metalType === "GOLD" || metalType === "SILVER"

  const issueMaterialWithId = issueMaterialToKarigar.bind(null, karigarId)
  const [state, formAction, pending] = useActionState(issueMaterialWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Material issued")
      setOpen(false)
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
        Issue Material
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue Material to Karigar</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="metalType" value={metalType} />
          {isPreciousMetal && <input type="hidden" name="issuePurity" value={issuePurity} />}

          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Metal Type</Label>
              <Select value={metalType} onValueChange={setMetalType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METAL_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0) + option.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isPreciousMetal && (
              <div className="space-y-2">
                <Label>Purity</Label>
                <Select value={issuePurity} onValueChange={setIssuePurity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PURITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Issue Weight (g) *</Label>
            <Input name="issueWeight" type="number" step="0.001" min="0" required />
          </div>

          <div className="space-y-2">
            <Label>Expected Return Date</Label>
            <Input name="expectedDate" type="date" />
          </div>

          <div className="space-y-2">
            <Label>{isPreciousMetal ? "Notes" : "Material Description *"}</Label>
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
            <Button type="submit" disabled={pending}>
              {pending ? "Issuing..." : "Issue Material"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
