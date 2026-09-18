"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useActionState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"

import {
  recordCustomerPayment,
  type PaymentFormState,
  type PaymentCustomerOption,
} from "@/lib/actions/payments-actions"
import { CustomerSelect } from "@/components/customers/customer-select"
import { useToast } from "@/components/providers/toast-provider"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  PaymentMethodFields,
  emptyPaymentMethodValue,
  type PaymentMethodValue,
} from "@/components/shared/payment-method-fields"

const initialState: PaymentFormState = { success: false, message: "" }

/**
 * Where an in-progress Payment In is parked while the user is away creating
 * a new party. sessionStorage (not localStorage) so it dies with the tab
 * and can never resurrect a stale draft days later.
 */
const DRAFT_KEY = "payment-in-dialog-draft"

type PaymentInDraft = {
  rows: PaymentMethodValue[]
  notes: string
}

type PaymentInDialogProps = {
  customers: PaymentCustomerOption[]
}

/**
 * Centralized "+ Payment In" — records money received from a customer
 * independent of any specific invoice, unlike the per-invoice "Record
 * Payment" dialog (which still exists and posts to the same PAYMENT_IN
 * ledger sourceType, so both show up together on the /payments/in list).
 *
 * Also reachable pre-filled via ?customerId=<id> — same query-param-opens-
 * the-dialog convention as the sidebar's ?new=1.
 */
export function PaymentInDialog({ customers }: PaymentInDialogProps) {
  const searchParams = useSearchParams()
  const initialCustomerId = searchParams.get("customerId") ?? ""
  // Set when we're bounced back here from creating a brand new party (see
  // saveDraft/the restore effect below) — also implies opening, same as
  // ?customerId=.
  const newCustomerIdParam = searchParams.get("newCustomerId")
  // Lets the sidebar's own "+" quick-add (?new=1) open this straight away,
  // same as every other section's quick-add landing on a real /new page —
  // this dialog is the closest equivalent Payment In has to one. A named
  // ?customerId= also implies opening.
  const [open, setOpen] = useState(
    () => searchParams.get("new") === "1" || !!initialCustomerId || !!newCustomerIdParam,
  )
  const [customerId, setCustomerId] = useState(initialCustomerId)
  const router = useRouter()
  const toast = useToast()

  const selectedCustomer = customers.find((c) => c.id === customerId)

  const [rows, setRows] = useState<PaymentMethodValue[]>([emptyPaymentMethodValue()])
  // Uncontrolled originally; now controlled so saveDraft/the restore effect
  // below can read and rewrite it without reaching into the DOM.
  const [notes, setNotes] = useState("")

  const [state, formAction, pending] = useActionState(recordCustomerPayment, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Payment In recorded")
      setOpen(false)
      router.refresh()
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    if (open) {
      setCustomerId(initialCustomerId)
      setRows([emptyPaymentMethodValue()])
      setNotes("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /**
   * Parks the in-progress payment (split rows + notes) before navigating
   * off to create a new party. Without this, "Create new party" inside the
   * nested CustomerSelect would silently discard everything already
   * entered in this dialog — see CustomerSelect's own onBeforeAddNew doc
   * comment.
   */
  const saveDraft = () => {
    const draft: PaymentInDraft = { rows, notes }

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // A full or blocked sessionStorage shouldn't stop the user getting to
      // the create page — they just lose the draft, same as before.
    }
  }

  // Restore-on-return. Runs once: if we're back here because a new party
  // was just created (newCustomerId), pick it up and restore whatever draft
  // saveDraft parked. Deliberately not dependent on searchParams —
  // re-running after the URL is cleaned would wipe edits made since.
  const draftRestoredRef = useRef(false)

  useEffect(() => {
    if (draftRestoredRef.current) return
    draftRestoredRef.current = true

    const newPartyId = searchParams.get("newCustomerId")

    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      raw = null
    }

    let draft: PaymentInDraft | null = null
    if (raw) {
      try {
        draft = JSON.parse(raw) as PaymentInDraft
      } catch {
        draft = null
      }
    }

    if (newPartyId) {
      setCustomerId(newPartyId)
      if (draft) {
        setRows(draft.rows && draft.rows.length ? draft.rows : [emptyPaymentMethodValue()])
        setNotes(draft.notes ?? "")
      }

      // Strip the one-shot param via history rather than router.replace, so
      // Next doesn't re-render the route and undo what we just restored.
      const params = new URLSearchParams(window.location.search)
      params.delete("newCustomerId")
      const query = params.toString()
      window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateRow = (index: number, patch: Partial<PaymentMethodValue>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addSplit = () => setRows((prev) => [...prev, emptyPaymentMethodValue()])
  const removeSplit = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index))

  const total = useMemo(() => rows.reduce((sum, row) => sum + (row.amount || 0), 0), [rows])
  const invalidTotal = total <= 0 || !customerId

  const paymentsJson = JSON.stringify(
    rows.map((row) => ({
      method: row.method,
      amount: row.amount,
      reference: row.reference || null,
      bankName: row.bankName || null,
      attachmentUrl: row.attachmentUrl || null,
    })),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="success"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Payment In
      </Button>

      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment In</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <input type="hidden" name="paymentsJson" value={paymentsJson} />

          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="space-y-2">
            <Label required>Party</Label>
            <CustomerSelect
              customers={customers}
              name="customerId"
              defaultValue={customerId}
              onChange={setCustomerId}
              onBeforeAddNew={() => saveDraft()}
            />
            {selectedCustomer && (
              <p className="text-sm text-muted-foreground">
                Outstanding:{" "}
                <span
                  className={
                    selectedCustomer.balanceType === "Advance"
                      ? "font-medium text-blue-600"
                      : selectedCustomer.currentBalance > 0
                        ? "font-medium text-red-600"
                        : "font-medium text-muted-foreground"
                  }
                >
                  {selectedCustomer.balanceType === "Advance"
                    ? `₹${Math.abs(selectedCustomer.currentBalance).toLocaleString("en-IN")} Advance`
                    : `₹${selectedCustomer.currentBalance.toLocaleString("en-IN")}`}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={index} className="rounded-lg border p-3 space-y-3">
                {index > 0 && (
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Second payment method
                    </Label>
                    <button
                      type="button"
                      onClick={() => removeSplit(index)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <PaymentMethodFields value={row} onChange={(patch) => updateRow(index, patch)} />
              </div>
            ))}
          </div>

          {rows.length < 2 && (
            <button
              type="button"
              onClick={addSplit}
              className="text-sm text-primary hover:underline"
            >
              + Split into a second payment method
            </button>
          )}

          <div className="flex items-center justify-between text-sm font-medium border-t pt-3">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Notes</Label>
            <Textarea
              name="notes"
              rows={2}
              placeholder="Optional notes..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
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
            <Button type="submit" disabled={pending || invalidTotal}>
              {pending ? "Saving..." : "Record Payment In"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
