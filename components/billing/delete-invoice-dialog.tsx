"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

import { deleteInvoice } from "@/lib/actions/invoice-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader } from "@/components/ui/loader"
import { useToast } from "@/components/providers/toast-provider"

type DeleteInvoiceDialogProps = {
  invoiceId: string
  invoiceNumber: string
  /** Icon-only trigger (red bordered square, matching PurchaseRowActions'
   * Delete icon) for a table row's Actions column, instead of the full
   * labeled button used in InvoiceActionsBar. */
  compact?: boolean
}

/**
 * Permanently deletes a draft invoice — restores any stock it decremented
 * first (deleteInvoice's own transaction handles that), then removes the
 * invoice itself. Only ever shown for a DRAFT invoice with no payments —
 * anything past that needs Cancel instead, since a real payment/ledger
 * entry can't just be quietly erased.
 */
export function DeleteInvoiceDialog({ invoiceId, invoiceNumber, compact = false }: DeleteInvoiceDialogProps) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function handleDelete() {
    try {
      setLoading(true)
      const result = await deleteInvoice(invoiceId)
      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        router.push("/billing")
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to delete invoice")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) setOpen(false)
        else setOpen(next)
      }}
    >
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent bg-red-600 text-white transition hover:bg-red-700"
          aria-label={`Delete ${invoiceNumber}`}
          title="Delete invoice"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="gap-2 border-transparent bg-red-600 text-white hover:bg-red-700"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      )}

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Invoice</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete{" "}
            <span className="font-medium text-foreground">{invoiceNumber}</span>?
            <br />
            <br />
            This action cannot be undone. Only draft invoices with no payments
            recorded can be deleted — any stock this invoice reserved will be
            restored.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader className="mr-2 h-4 w-4" />
                Deleting...
              </>
            ) : (
              "Delete Invoice"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
