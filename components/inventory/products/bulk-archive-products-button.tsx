"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Archive } from "lucide-react"

import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { bulkArchiveProducts } from "@/lib/actions/inventory/product-actions"

/**
 * "Archive Selected" — marks every ticked product Inactive in one go. Sits
 * beside BulkDeleteButton for the exact case that button can't help with: a
 * product with real stock/invoice/karigar-job history refuses to delete
 * (see deleteProduct's own guard), but the merchant still wants it off the
 * active list. No confirmation dialog, same as the single-row Status
 * toggle it mirrors — deactivating is reversible (re-enable any time),
 * unlike delete.
 */
export function BulkArchiveProductsButton({
  selectedIds,
  onDone,
}: {
  selectedIds: string[]
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  if (selectedIds.length === 0) return null

  const handleArchive = () => {
    startTransition(async () => {
      const { count } = await bulkArchiveProducts(selectedIds)
      router.refresh()
      toast.success(`${count} product${count === 1 ? "" : "s"} marked inactive`)
      onDone()
    })
  }

  return (
    <Button
      type="button"
      variant="warning"
      size="sm"
      className="gap-2"
      onClick={handleArchive}
      disabled={isPending}
    >
      <Archive className="h-4 w-4" />
      {isPending ? "Archiving..." : `Archive Selected (${selectedIds.length})`}
    </Button>
  )
}
