"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Send } from "lucide-react"

import {
  sendDraftOrderToKarigar,
  type DraftOrderFormState,
} from "@/lib/actions/draft-order-actions"
import { KarigarSelect, type KarigarOption } from "@/components/karigars/karigar-select"
import { LocationSelect, type LocationOption } from "@/components/shared/location-select"
import { todayForDateInput } from "@/lib/date-input"
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
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: DraftOrderFormState = { success: false, message: "" }

type SendToKarigarDialogProps = {
  orderId: string
  karigars: KarigarOption[]
  locations?: LocationOption[]
  defaultLocationId?: string | null
}

export function SendToKarigarDialog({
  orderId,
  karigars,
  locations = [],
  defaultLocationId = null,
}: SendToKarigarDialogProps) {
  const [open, setOpen] = useState(false)
  const [karigarId, setKarigarId] = useState("")
  const [locationId, setLocationId] = useState(defaultLocationId ?? "")
  const router = useRouter()
  const toast = useToast()

  const sendWithId = sendDraftOrderToKarigar.bind(null, orderId)
  const [state, formAction, pending] = useActionState(sendWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Sent to artisan")
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
        <Send className="h-4 w-4" />
        Send to Artisan
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Draft Order to Artisan</DialogTitle>
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

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>
              Artisan <RequiredMark />
            </Label>
            <KarigarSelect karigars={karigars} defaultValue={karigarId} onChange={setKarigarId} />
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Expected Return Date</Label>
            <Input name="expectedDate" type="date" min={todayForDateInput()} />
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Location</Label>
            <LocationSelect
              locations={locations}
              name="locationId"
              defaultValue={locationId}
              onChange={setLocationId}
            />
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} placeholder="Optional notes for the artisan" />
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
            <Button type="submit" disabled={pending || !karigarId}>
              {pending ? "Sending..." : "Send to Artisan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
