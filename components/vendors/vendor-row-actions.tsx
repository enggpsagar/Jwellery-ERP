"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Archive, Loader2, Trash2 } from "lucide-react"

import type { Vendor } from "@/lib/actions/vendor-actions"
import {
  archiveVendor,
  deleteVendor,
} from "@/lib/actions/vendor-actions"
import { EditVendorDialog } from "@/components/vendors/edit-vendor-dialog"
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
        {/* This will now show only the pencil icon trigger */}
        <EditVendorDialog vendor={vendor} states={states} />

        <button
          type="button"
          onClick={() => setConfirmAction("archive")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 text-amber-700 transition hover:bg-amber-50"
          aria-label={`Archive ${vendor.name}`}
          title="Archive vendor"
        >
          <Archive className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setConfirmAction("delete")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50"
          aria-label={`Delete ${vendor.name}`}
          title="Delete vendor"
        >
          <Trash2 className="h-4 w-4" />
        </button>
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
                  onClick={handleArchive}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                  onClick={handleDelete}
                  disabled={loading}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
