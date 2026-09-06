"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2, AlertTriangle } from "lucide-react"

import {
  getStoreRecordCounts,
  forceDeleteStore,
  type StoreRecordCounts,
} from "@/lib/actions/store-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader } from "@/components/ui/loader"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"

type StoreDeleteDialogProps = {
  storeId: string
  storeName: string
}

const COUNT_LABELS: { key: keyof Omit<StoreRecordCounts, "total">; label: string }[] = [
  { key: "customers", label: "customers" },
  { key: "vendors", label: "vendors" },
  { key: "karigars", label: "karigars" },
  { key: "products", label: "products" },
  { key: "invoices", label: "invoices" },
  { key: "kachaInvoices", label: "kacha slips" },
  { key: "purchases", label: "purchases" },
  { key: "quotations", label: "quotations" },
  { key: "users", label: "users" },
]

/**
 * Row-level Delete for the Stores list. A plain delete only ever runs when
 * the store is genuinely empty — any real record/transaction routes to the
 * Force Delete confirmation instead, which requires typing the store's
 * exact name (not just a click) given the blast radius: forceDeleteStore
 * permanently wipes every record under this store, with no undo.
 */
export function StoreDeleteDialog({ storeId, storeName }: StoreDeleteDialogProps) {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = React.useState(false)
  const [loadingCounts, setLoadingCounts] = React.useState(false)
  const [counts, setCounts] = React.useState<StoreRecordCounts | null>(null)
  const [confirmText, setConfirmText] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)

  async function handleOpen() {
    setOpen(true)
    setConfirmText("")
    setLoadingCounts(true)
    try {
      const result = await getStoreRecordCounts(storeId)
      setCounts(result)
    } catch (error) {
      console.error(error)
      toast.error("Failed to check this store's records")
      setOpen(false)
    } finally {
      setLoadingCounts(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && deleting) return
    setOpen(next)
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const result = await forceDeleteStore(storeId)
      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to delete store")
    } finally {
      setDeleting(false)
    }
  }

  const hasRecords = Boolean(counts && counts.total > 0)
  const nameMatches = confirmText.trim() === storeName.trim()
  const canDelete = loadingCounts
    ? false
    : hasRecords
      ? nameMatches
      : true

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50"
        aria-label={`Delete ${storeName}`}
        title="Delete store"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Delete {storeName}
            </DialogTitle>
          </DialogHeader>

          {loadingCounts ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="h-6 w-6" />
            </div>
          ) : hasRecords ? (
            <div className="space-y-4">
              <DialogDescription>
                This store has existing records and cannot be deleted normally.
              </DialogDescription>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">This store has:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {COUNT_LABELS.filter((item) => (counts![item.key] as number) > 0).map(
                    (item) => (
                      <li key={item.key}>
                        {counts![item.key] as number} {item.label}
                      </li>
                    ),
                  )}
                </ul>
              </div>

              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <p className="font-semibold">Force Delete — permanent, no undo</p>
                <p className="mt-1">
                  This will permanently delete <strong>every record</strong> associated
                  with this store — customers, vendors, invoices, purchases, ledger
                  entries, users, and everything else listed above. This cannot be
                  reversed.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-store-name">
                  Type <span className="font-semibold">{storeName}</span> to confirm
                </Label>
                <Input
                  id="confirm-store-name"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder={storeName}
                  autoComplete="off"
                />
              </div>
            </div>
          ) : (
            <DialogDescription>
              <span className="font-medium text-foreground">{storeName}</span> has no
              customers, vendors, karigars, products, invoices, purchases, quotations,
              or other users on file. Deleting it removes the store itself — this
              cannot be undone.
            </DialogDescription>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
            >
              {deleting ? (
                <>
                  <Loader className="mr-2 h-4 w-4" />
                  Deleting...
                </>
              ) : hasRecords ? (
                "Force Delete"
              ) : (
                "Delete Store"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
