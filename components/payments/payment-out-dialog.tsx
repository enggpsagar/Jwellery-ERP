"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"

import { recordPaymentOut, type PaymentFormState } from "@/lib/actions/payments-actions"
import type { PaymentKarigarOption } from "@/lib/actions/payments-actions"
import { VendorSelect, type VendorOption } from "@/components/vendors/vendor-select"
import { KarigarSelect } from "@/components/karigars/karigar-select"
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

type PartyType = "VENDOR" | "KARIGAR"

type PaymentOutDialogProps = {
  vendors: VendorOption[]
  karigars: PaymentKarigarOption[]
}

/**
 * Centralized "+ Payment Out" — records money paid to a Vendor or a
 * Karigar independent of any specific purchase/job. Existing per-record
 * "Record Payment" dialogs (purchase, karigar) keep working unchanged and
 * post to the same PAYMENT_OUT ledger sourceType, so this list and those
 * flows never disagree.
 */
export function PaymentOutDialog({ vendors, karigars }: PaymentOutDialogProps) {
  const searchParams = useSearchParams()
  // Lets the sidebar's own "+" quick-add (?new=1) open this straight away,
  // same as PaymentInDialog.
  const [open, setOpen] = useState(() => searchParams.get("new") === "1")
  const [partyType, setPartyType] = useState<PartyType>("VENDOR")
  const [partyId, setPartyId] = useState("")
  const router = useRouter()
  const toast = useToast()

  const [rows, setRows] = useState<PaymentMethodValue[]>([emptyPaymentMethodValue()])

  const [state, formAction, pending] = useActionState(recordPaymentOut, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Payment Out recorded")
      setOpen(false)
      router.refresh()
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    if (open) {
      setPartyType("VENDOR")
      setPartyId("")
      setRows([emptyPaymentMethodValue()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const updateRow = (index: number, patch: Partial<PaymentMethodValue>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addSplit = () => setRows((prev) => [...prev, emptyPaymentMethodValue()])
  const removeSplit = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index))

  const total = useMemo(() => rows.reduce((sum, row) => sum + (row.amount || 0), 0), [rows])
  const invalidTotal = total <= 0 || !partyId

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
        className="gap-2 bg-red-600 text-white hover:bg-red-700"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Payment Out
      </Button>

      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment Out</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <input type="hidden" name="partyType" value={partyType} />
          <input type="hidden" name="paymentsJson" value={paymentsJson} />

          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="space-y-2">
            <Label required>Pay To</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPartyType("VENDOR")
                  setPartyId("")
                }}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                  partyType === "VENDOR"
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                Vendor
              </button>
              <button
                type="button"
                onClick={() => {
                  setPartyType("KARIGAR")
                  setPartyId("")
                }}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                  partyType === "KARIGAR"
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                Artisan
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label required>{partyType === "VENDOR" ? "Vendor" : "Artisan"}</Label>
            {partyType === "VENDOR" ? (
              <VendorSelect
                vendors={vendors}
                name="vendorId"
                defaultValue={partyId}
                onChange={setPartyId}
              />
            ) : (
              <KarigarSelect
                karigars={karigars}
                name="karigarId"
                defaultValue={partyId}
                onChange={setPartyId}
              />
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
            <Textarea name="notes" rows={2} placeholder="Optional notes..." />
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
              {pending ? "Saving..." : "Record Payment Out"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
