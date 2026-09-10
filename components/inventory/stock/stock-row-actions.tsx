"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, Pencil, Trash2 } from "lucide-react"

import { deleteInventoryStock } from "@/lib/actions/inventory/stock-actions"
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

type StockRowActionsProps = {
  stockId: string
  stockCode: string
}

/**
 * View + Edit + Delete for a single stock item — factored out of
 * StockTable's old inline row actions (moved to the detail panel, same
 * dedup already done for Products/Customers). Delete reuses the already-
 * guarded deleteInventoryStock (blocked once linked to an invoice/kacha/
 * artisan-job record) — previously only reachable via bulk delete from the
 * list toolbar, with no per-row equivalent.
 */
export function StockRowActions({ stockId, stockCode }: StockRowActionsProps) {
  const router = useRouter()
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function handleDelete() {
    try {
      setLoading(true)
      const result = await deleteInventoryStock(stockId)
      if (result.success) {
        toast.success(result.message || "Stock item deleted")
        setConfirmDelete(false)
        router.push("/inventory/stock")
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to delete stock item")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          href={`/inventory/stock/${stockId}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
          title="View stock item"
        >
          <Eye className="h-4 w-4" />
        </Link>

        <Link
          href={`/inventory/stock/${stockId}/edit`}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-sm text-white shadow-sm hover:bg-indigo-700"
          title="Edit stock item"
        >
          <Pencil className="h-4 w-4" />
        </Link>

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-sm text-white shadow-sm hover:bg-red-700"
          aria-label={`Delete ${stockCode}`}
          title="Delete stock item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open && !loading) setConfirmDelete(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Stock Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-medium text-foreground">{stockCode}</span>? This
              can&apos;t be undone.
              <br />
              <br />
              <span className="text-red-600">
                Stock already linked to an invoice, estimate, or artisan job
                can&apos;t be deleted this way.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={loading}>
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
                "Delete Stock Item"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
