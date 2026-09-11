"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Pencil, ToggleRight, Trash2 } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import type { Vendor } from "@/lib/actions/vendor-actions"
import {
  archiveVendor,
  deleteVendor,
} from "@/lib/actions/vendor-actions"
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

type StateItem = {
  id: string
  name: string
}

type VendorRowActionsProps = {
  vendor: Vendor
  states: StateItem[]
}

type ConfirmAction = "archive" | "delete" | null

export function VendorRowActions({
  vendor,
  states,
}: VendorRowActionsProps) {
  const router = useRouter()
  const toast = useToast()

  const [confirmAction, setConfirmAction] = React.useState<ConfirmAction>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleArchive() {
    try {
      setLoading(true)
      const result = await archiveVendor(vendor.id)

      if (result.success) {
        toast.success(result.message)
        setConfirmAction(null)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to archive vendor")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    try {
      setLoading(true)
      const result = await deleteVendor(vendor.id)

      if (result.success) {
        toast.success(result.message)
        setConfirmAction(null)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to delete vendor")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button variant="success" size="sm" asChild>
          <Link href={`/payments/out?new=1&vendorId=${vendor.id}`}>
            Pay Now
          </Link>
        </Button>

        {/* A page, not a dialog — same reasoning as customers. */}
        <Button variant="edit" size="icon" asChild aria-label={`Edit ${vendor.name}`} title="Edit vendor">
          <Link href={`/vendors/${vendor.id}/edit?returnTo=${encodeURIComponent("/vendors")}`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>

        <Button
          type="button"
          variant="warning"
          size="icon"
          onClick={() => setConfirmAction("archive")}
          aria-label={`Archive ${vendor.name}`}
          title="Archive vendor"
        >
          <ToggleRight className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="destructive"
          size="icon"
          onClick={() => setConfirmAction("delete")}
          aria-label={`Delete ${vendor.name}`}
          title="Delete vendor"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open && !loading) setConfirmAction(null)
        }}
      >
        <DialogContent className="max-w-md">
          {confirmAction === "archive" && (
            <>
              <DialogHeader>
                <DialogTitle>Archive Vendor</DialogTitle>
                <DialogDescription>
                  Are you sure you want to archive{" "}
                  <span className="font-medium text-foreground">
                    {vendor.name}
                  </span>
                  ?
                  <br />
                  <br />
                  Archived vendors are removed from the active vendor list,
                  but their historical records remain in the system.
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmAction(null)}
                  disabled={loading}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  variant="warning"
                  onClick={handleArchive}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader className="mr-2 h-4 w-4" />
                      Archiving...
                    </>
                  ) : (
                    "Archive Vendor"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}

          {confirmAction === "delete" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete Vendor</DialogTitle>
                <DialogDescription>
                  Are you sure you want to permanently delete{" "}
                  <span className="font-medium text-foreground">
                    {vendor.name}
                  </span>
                  ?
                  <br />
                  <br />
                  This action cannot be undone.
                  <br />
                  <br />
                  <span className="text-red-600">
                    Note: deletion is allowed only if this vendor has no
                    purchase or ledger history.
                  </span>
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmAction(null)}
                  disabled={loading}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader className="mr-2 h-4 w-4" />
                      Deleting...
                    </>
                  ) : (
                    "Delete Vendor"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
