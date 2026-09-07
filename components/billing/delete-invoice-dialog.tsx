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
}

/**
 * Permanently deletes a draft invoice — restores any stock it decremented
 * first (deleteInvoice's own transaction handles that), then removes the
 * invoice itself. Only ever shown for a DRAFT invoice with no payments —
 * anything past that needs Cancel instead, since a real payment/ledger
 * entry can't just be quietly erased.
 */
export function DeleteInvoiceDialog({ invoiceId, invoiceNumber }: DeleteInvoiceDialogProps) {
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
      <Button
        type="button"
        variant="outline"
        className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>

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
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
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
