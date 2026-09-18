"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useActionState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"

import { recordPaymentOut, type PaymentFormState } from "@/lib/actions/payments-actions"
import type { PaymentKarigarOption, PaymentVendorOption } from "@/lib/actions/payments-actions"
import { CustomerSelect } from "@/components/customers/customer-select"
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

/**
 * Where an in-progress Payment Out is parked while the user is away
 * creating a new vendor. sessionStorage (not localStorage) so it dies with
 * the tab and can never resurrect a stale draft days later. Only the Vendor
 * half of this dialog ever navigates away like this — the Karigar half has
 * its own in-page AddKarigarDialog modal and never touches this.
 */
const DRAFT_KEY = "payment-out-dialog-draft"

type PaymentOutDraft = {
  rows: PaymentMethodValue[]
  notes: string
  partyType: PartyType
}

type PaymentOutDialogProps = {
  vendors: PaymentVendorOption[]
  karigars: PaymentKarigarOption[]
}

/**
 * Centralized "+ Payment Out" — records money paid to a Vendor or a
 * Karigar independent of any specific purchase/job. Existing per-record
 * "Record Payment" dialogs (purchase, karigar) keep working unchanged and
 * post to the same PAYMENT_OUT ledger sourceType, so this list and those
 * flows never disagree.
 *
 * Also reachable pre-filled via ?vendorId=<id> (a party's own Supplier
 * Ledger "Pay Out" button — see supplier-ledger-body.tsx) — same
 * query-param-opens-the-dialog convention as the sidebar's ?new=1, just
 * naming which party too.
 */
export function PaymentOutDialog({ vendors, karigars }: PaymentOutDialogProps) {
  const searchParams = useSearchParams()
  const initialVendorId = searchParams.get("vendorId") ?? ""
  // Set when we're bounced back here from creating a brand new vendor (see
  // saveDraft/the restore effect below) — also implies opening, same as
  // ?vendorId=.
  const newPartyIdParam = searchParams.get("newCustomerId")
  // Lets the sidebar's own "+" quick-add (?new=1) open this straight away,
  // same as PaymentInDialog — a named ?vendorId= also implies opening.
  const [open, setOpen] = useState(
    () => searchParams.get("new") === "1" || !!initialVendorId || !!newPartyIdParam,
  )
  const [partyType, setPartyType] = useState<PartyType>("VENDOR")
  const [partyId, setPartyId] = useState(initialVendorId)
  // Own copy so a karigar created via KarigarSelect's "+" mid-form shows up
  // immediately, without a page refetch — same as product-form.tsx's own
  // metals/purities lists fed by AddMetalDialog/AddPurityDialog.
  const [karigarList, setKarigarList] = useState<PaymentKarigarOption[]>(karigars)
  const router = useRouter()
  const toast = useToast()

  const selectedVendor = partyType === "VENDOR" ? vendors.find((v) => v.id === partyId) : undefined

  const [rows, setRows] = useState<PaymentMethodValue[]>([emptyPaymentMethodValue()])
  // Uncontrolled originally; now controlled so saveDraft/the restore effect
  // below can read and rewrite it without reaching into the DOM.
  const [notes, setNotes] = useState("")

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
      setPartyId(initialVendorId)
      setRows([emptyPaymentMethodValue()])
      setNotes("")
      setKarigarList(karigars)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /**
   * Parks the in-progress payment (split rows + notes + which party tab was
   * active) before navigating off to create a new vendor. Without this,
   * "Create new party" inside the nested CustomerSelect would silently
   * discard everything already entered in this dialog — see CustomerSelect's
   * own onBeforeAddNew doc comment. Only wired to the Vendor path; the
   * Karigar path's AddKarigarDialog is a real in-page modal and never loses
   * this state to begin with.
   */
  const saveDraft = () => {
    const draft: PaymentOutDraft = { rows, notes, partyType }

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // A full or blocked sessionStorage shouldn't stop the user getting to
      // the create page — they just lose the draft, same as before.
    }
  }

  // Restore-on-return. Runs once: if we're back here because a new vendor
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

    let draft: PaymentOutDraft | null = null
    if (raw) {
      try {
        draft = JSON.parse(raw) as PaymentOutDraft
      } catch {
        draft = null
      }
    }

    if (newPartyId) {
      // CustomerSelect (the "Create new party" affordance that led here) is
      // only ever wired up on the Vendor half of this dialog, so the party
      // just created is always a vendor.
      setPartyType(draft?.partyType ?? "VENDOR")
      setPartyId(newPartyId)
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
        className="gap-2"
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
                Supplier
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
            <Label required>{partyType === "VENDOR" ? "Supplier" : "Artisan"}</Label>
            {partyType === "VENDOR" ? (
              <CustomerSelect
                customers={vendors}
                name="vendorId"
                defaultValue={partyId}
                onChange={setPartyId}
                onBeforeAddNew={() => saveDraft()}
                termLabel="supplier"
              />
            ) : (
              <KarigarSelect
                karigars={karigarList}
                name="karigarId"
                defaultValue={partyId}
                onChange={setPartyId}
                onCreated={(karigar) =>
                  setKarigarList((prev) => [
                    ...prev,
                    { id: karigar.id, name: karigar.name, mobile: karigar.mobile ?? null, code: karigar.code ?? null },
                  ])
                }
              />
            )}
            {selectedVendor && (
              <p className="text-sm text-muted-foreground">
                Outstanding:{" "}
                <span
                  className={
                    selectedVendor.balanceType === "Advance"
                      ? "font-medium text-blue-600"
                      : selectedVendor.currentBalance > 0
                        ? "font-medium text-red-600"
                        : "font-medium text-muted-foreground"
                  }
                >
                  {selectedVendor.balanceType === "Advance"
                    ? `₹${Math.abs(selectedVendor.currentBalance).toLocaleString("en-IN")} Advance`
                    : `₹${selectedVendor.currentBalance.toLocaleString("en-IN")}`}
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
              {pending ? "Saving..." : "Record Payment Out"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
