"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { createReminder, type ReminderFormState } from "@/lib/actions/calendar-actions"
import { useToast } from "@/components/providers/toast-provider"
import { todayForDateInput } from "@/lib/date-input"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: ReminderFormState = { success: false, message: "" }

/**
 * The catch-all "other important task/deadline" entry point for the
 * Calendar View — everything else on the calendar (invoice due dates,
 * karigar returns, quotation expiry, plan renewal) comes from a date field
 * that already exists elsewhere; a Reminder is for the things that don't.
 */
export function AddReminderDialog() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const [state, formAction, pending] = useActionState(createReminder, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Reminder added")
      setOpen(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Reminder
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Reminder</DialogTitle>
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

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="title">Title <RequiredMark /></Label>
            <Input id="title" name="title" placeholder="e.g. Call vendor about pending order" required />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="dueDate">Date <RequiredMark /></Label>
            <Input id="dueDate" name="dueDate" type="date" defaultValue={todayForDateInput()} required />
          </div>

          <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Optional" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add Reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
