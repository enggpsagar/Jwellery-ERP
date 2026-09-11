"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ListChecks, Pencil, Trash2 } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import type { Purchase } from "@/lib/actions/purchase-actions"
import { deletePurchase } from "@/lib/actions/purchase-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"
import { EditPurchaseDialog } from "@/components/purchases/edit-purchase-dialog"
import type { LocationOption } from "@/components/shared/location-select"

type PurchaseRowActionsProps = {
  purchase: Purchase
  locations: LocationOption[]
}

export function PurchaseRowActions({ purchase, locations }: PurchaseRowActionsProps) {
  const router = useRouter()
  const toast = useToast()

  // Full line-item editing is only offered for DRAFT/PARTIAL — updatePurchase
  // itself re-checks this (and whether the stock it created has since moved)
  // server-side regardless, same defense-in-depth as Invoice's canFullyEdit.
  const canEditItems = purchase.status === "DRAFT" || purchase.status === "PARTIAL"

  const [editOpen, setEditOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function handleDelete() {
    try {
      setLoading(true)
      const result = await deletePurchase(purchase.id)

      if (result.success) {
        toast.success(result.message)
        setConfirmDelete(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to delete purchase")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {canEditItems && (
          <Button
            asChild
            variant="outline"
            className="gap-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
          >
            <Link href={`/purchases/${purchase.id}/edit`}>
              <ListChecks className="h-4 w-4" />
              Edit Items
            </Link>
          </Button>
        )}

        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent bg-primary/10 text-primary transition hover:bg-primary/20"
          aria-label={`Edit ${purchase.purchaseNumber}`}
          title="Edit purchase"
        >
          <Pencil className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent bg-red-600 text-white transition hover:bg-red-700"
          aria-label={`Delete ${purchase.purchaseNumber}`}
          title="Delete purchase"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <EditPurchaseDialog
        purchaseId={purchase.id}
        purchaseDate={purchase.purchaseDate}
        vendorInvoiceNumber={purchase.vendorInvoiceNumber}
        notes={purchase.notes}
        locationId={purchase.locationId}
        locations={locations}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open && !loading) setConfirmDelete(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Purchase</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-medium text-foreground">{purchase.purchaseNumber}</span>?
              <br />
              <br />
              This action cannot be undone.
              <br />
              <br />
              <span className="text-red-600">
                Only draft purchases with no payments recorded and stock that
                hasn&apos;t moved (sold, transferred, or otherwise changed) since
                this purchase created it can be deleted.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={loading}
            >
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
                "Delete Purchase"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
