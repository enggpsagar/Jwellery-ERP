"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, Pencil, Trash2 } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import type { Customer } from "@/lib/actions/customer-actions"
import {
  archiveCustomer,
  deleteCustomer,
} from "@/lib/actions/customer-actions"
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

type CustomerRowActionsProps = {
  customer: Customer
  states: StateItem[]
}

type ConfirmAction = "archive" | "delete" | null

export function CustomerRowActions({
  customer,
  states,
}: CustomerRowActionsProps) {
  const router = useRouter()
  const toast = useToast()

  const [confirmAction, setConfirmAction] = React.useState<ConfirmAction>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleArchive() {
    try {
      setLoading(true)
      const result = await archiveCustomer(customer.id)

      if (result.success) {
        toast.success(result.message)
        setConfirmAction(null)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to archive customer")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    try {
      setLoading(true)
      const result = await deleteCustomer(customer.id)

      if (result.success) {
        toast.success(result.message)
        setConfirmAction(null)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to delete customer")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {/* A page, not a dialog — the edit form carries every field the
            record holds and does not fit a modal on a phone. */}
        <Link
          href={`/customers/${customer.id}/edit?returnTo=${encodeURIComponent("/customers")}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent"
          aria-label={`Edit ${customer.name}`}
          title="Edit customer"
        >
          <Pencil className="h-4 w-4" />
        </Link>

        <button
          type="button"
          onClick={() => setConfirmAction("archive")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 text-amber-700 transition hover:bg-amber-50"
          aria-label={`Archive ${customer.name}`}
          title="Archive customer"
        >
          <Archive className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setConfirmAction("delete")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50"
          aria-label={`Delete ${customer.name}`}
          title="Delete customer"
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
                <DialogTitle>Archive Customer</DialogTitle>
                <DialogDescription>
                  Are you sure you want to archive{" "}
                  <span className="font-medium text-foreground">
                    {customer.name}
                  </span>
                  ?
                  <br />
                  <br />
                  Archived customers are removed from the active customer list,
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
                      <Loader className="mr-2 h-4 w-4" />
                      Archiving...
                    </>
                  ) : (
                    "Archive Customer"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}

          {confirmAction === "delete" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete Customer</DialogTitle>
                <DialogDescription>
                  Are you sure you want to permanently delete{" "}
                  <span className="font-medium text-foreground">
                    {customer.name}
                  </span>
                  ?
                  <br />
                  <br />
                  This action cannot be undone.
                  <br />
                  <br />
                  <span className="text-red-600">
                    Note: deletion is allowed only if this customer has no
                    invoice or ledger history.
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
                      <Loader className="mr-2 h-4 w-4" />
                      Deleting...
                    </>
                  ) : (
                    "Delete Customer"
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