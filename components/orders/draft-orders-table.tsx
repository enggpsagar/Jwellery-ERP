"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

import { DraftOrderStatusBadge } from "@/components/orders/draft-order-status-badge"
import { deleteDraftOrder } from "@/lib/actions/draft-order-actions"
import { formatShortDate } from "@/lib/utils"
import type { DraftOrderRow } from "@/lib/actions/draft-order-actions"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type DraftOrdersTableProps = {
  orders: DraftOrderRow[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}

/** Only a DRAFT or already-CANCELLED order can be deleted — mirrors
 *  deleteDraftOrder's own guard, checked here too so the row's delete
 *  button doesn't even appear for one that would just be rejected. */
function isDeletable(status: string) {
  return status === "DRAFT" || status === "CANCELLED"
}

export function DraftOrdersTable({ orders, selectedIds, onSelectionChange }: DraftOrdersTableProps) {
  const router = useRouter()
  const toast = useToast()
  const [confirmOrder, setConfirmOrder] = React.useState<DraftOrderRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const allIds = orders.map((order) => order.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))

  function toggleAll(checked: boolean) {
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedIds, ...allIds])))
    } else {
      onSelectionChange(selectedIds.filter((id) => !allIds.includes(id)))
    }
  }

  function toggleOne(id: string, checked: boolean) {
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedIds, id])))
    } else {
      onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id))
    }
  }

  async function handleDelete() {
    if (!confirmOrder) return
    try {
      setDeleting(true)
      const result = await deleteDraftOrder(confirmOrder.id)
      if (result.success) {
        toast.success(result.message)
        setConfirmOrder(null)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to delete order")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-t-xl border border-b-0 bg-card">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => toggleAll(event.target.checked)}
                    aria-label="Select all draft orders"
                    className="h-4 w-4 rounded border-input"
                  />
                </th>
                <SortableTableHead label="Order #" sortKey="orderNumber" defaultSortBy="orderDate" />
                <SortableTableHead label="Date" sortKey="orderDate" defaultSortBy="orderDate" />
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Items</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Artisan Job</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No draft orders found.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(order.id)}
                        onChange={(event) => toggleOne(order.id, event.target.checked)}
                        aria-label={`Select ${order.orderNumber}`}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/orders/${order.id}`} className="text-primary hover:underline">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatShortDate(order.orderDate)}
                    </td>
                    <td className="px-4 py-3">{order.customer?.name ?? "—"}</td>
                    <td className="px-4 py-3">{order.itemCount}</td>
                    <td className="px-4 py-3">
                      <DraftOrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {order.karigarJob?.jobNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isDeletable(order.status) ? (
                        <button
                          type="button"
                          onClick={() => setConfirmOrder(order)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50"
                          aria-label={`Delete ${order.orderNumber}`}
                          title="Delete draft order"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={confirmOrder !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirmOrder(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Draft Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-medium text-foreground">{confirmOrder?.orderNumber}</span>?
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOrder(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
