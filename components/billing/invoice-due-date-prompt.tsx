"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock } from "lucide-react"

import { setInvoiceDueDate } from "@/lib/actions/invoice-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

/**
 * "This invoice still has money owed and no due date — want a reminder?"
 * Shown only while there's a real balance and nothing set yet (see the
 * caller's gate in InvoiceDetailContent). Once a date is picked, the
 * Calendar page shows it automatically (getCalendarEvents already reads
 * every Invoice.dueDate) — this prompt IS the whole "add to calendar"
 * step, not a separate reminder record.
 */
export function InvoiceDueDatePrompt({
  invoiceId,
  balanceAmount,
}: {
  invoiceId: string
  balanceAmount: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [picking, setPicking] = useState(false)
  const [date, setDate] = useState("")
  const [pending, setPending] = useState(false)

  async function handleSave() {
    if (!date) return
    setPending(true)
    try {
      const result = await setInvoiceDueDate(invoiceId, date)
      if (result.success) {
        toast.success(result.message || "Due date set")
        setPicking(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to set due date")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <CalendarClock className="h-5 w-5 shrink-0 text-amber-600" />
      <p className="flex-1">
        ₹{balanceAmount.toFixed(2)} is still due on this invoice, and no due date is set —
        set one to get a reminder on your Calendar.
      </p>

      {picking ? (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-40 bg-white"
            autoFocus
          />
          <Button size="sm" onClick={handleSave} disabled={!date || pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicking(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="warning" onClick={() => setPicking(true)}>
          Set Due Date
        </Button>
      )}
    </div>
  )
}
