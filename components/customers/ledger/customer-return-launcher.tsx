"use client"

import { useEffect, useState } from "react"
import { RotateCcw, Undo2 } from "lucide-react"

import {
  getCustomerReturnableInvoices,
  type CustomerSaleInvoiceOption,
} from "@/lib/actions/invoice-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ReturnItemsDialog } from "@/components/billing/return-items-dialog"
import { CancelInvoiceDialog } from "@/components/billing/cancel-invoice-dialog"

type CustomerReturnLauncherProps = {
  customerId: string
  action: "refund" | "replace"
}

/**
 * Customer-first entry point into the two invoice-level return mechanisms
 * that already exist (ReturnItemsDialog / CancelInvoiceDialog's Return &
 * Exchange mode) — picks which Sale Invoice to act against first, then
 * hands off into that exact same dialog/logic rather than a parallel
 * implementation, so there's one source of truth for what a return does.
 */
export function CustomerReturnLauncher({ customerId, action }: CustomerReturnLauncherProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [invoices, setInvoices] = useState<CustomerSaleInvoiceOption[] | null>(null)
  const [selected, setSelected] = useState<CustomerSaleInvoiceOption | null>(null)

  const isRefund = action === "refund"
  const Icon = isRefund ? Undo2 : RotateCcw
  const label = isRefund ? "Refund" : "Replace"
  // Same solid-chart-hue convention as the header's Sale/Purchase buttons —
  // Refund and Replace were both a plain grey outline button before,
  // reading as afterthoughts next to Sale's solid color.
  const colorClass = isRefund
    ? "bg-[var(--chart-5)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-5)_88%,black)]"
    : "bg-[var(--chart-4)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-4)_88%,black)]"

  useEffect(() => {
    if (!pickerOpen) return
    setLoading(true)
    getCustomerReturnableInvoices(customerId)
      .then((result) => setInvoices(isRefund ? result.refundable : result.replaceable))
      .finally(() => setLoading(false))
  }, [pickerOpen, customerId, isRefund])

  return (
    <>
      <Button
        type="button"
        className={`gap-2 ${colorClass}`}
        onClick={() => setPickerOpen(true)}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select a Sale Invoice</DialogTitle>
            <DialogDescription>
              {isRefund
                ? "Choose the invoice to return items against."
                : "Choose the invoice to cancel and replace."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading invoices...</p>
          ) : !invoices || invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isRefund
                ? "None of this party's invoices currently qualify for a return — either the return window has passed, or none are paid/partially paid."
                : "None of this party's invoices currently qualify for Return & Exchange — only draft or partially-paid invoices can be cancelled and replaced."}
            </p>
          ) : null}

          {!loading && invoices && invoices.length > 0 && (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => {
                    setSelected(invoice)
                    setPickerOpen(false)
                  }}
                  className="flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition hover:bg-accent"
                >
                  <span>
                    <span className="font-medium">{invoice.invoiceNumber}</span>
                    <span className="block text-xs text-muted-foreground">
                      {invoice.invoiceDate}
                    </span>
                  </span>
                  <span className="font-medium">₹{invoice.totalAmount.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selected && isRefund && (
        <ReturnItemsDialog
          invoiceId={selected.id}
          invoiceNumber={selected.invoiceNumber}
          open
          hideTrigger
          onOpenChange={(open) => {
            if (!open) setSelected(null)
          }}
        />
      )}

      {selected && !isRefund && (
        <CancelInvoiceDialog
          invoiceId={selected.id}
          invoiceNumber={selected.invoiceNumber}
          balanceAmount={selected.balanceAmount}
          mode="returnExchange"
          open
          hideTrigger
          onOpenChange={(open) => {
            if (!open) setSelected(null)
          }}
        />
      )}
    </>
  )
}
