"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArchiveRestore } from "lucide-react"

import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { bulkUnarchiveProducts } from "@/lib/actions/inventory/product-actions"

/**
 * "Unarchive" — marks every ticked product Active again in one go, the
 * Archived Products page's own counterpart to BulkArchiveProductsButton.
 * No confirmation dialog, same as the single-row Status toggle it mirrors
 * (re-activating is exactly as reversible as archiving was).
 */
export function BulkUnarchiveProductsButton({
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

  const handleUnarchive = () => {
    startTransition(async () => {
      const { count } = await bulkUnarchiveProducts(selectedIds)
      router.refresh()
      toast.success(`${count} product${count === 1 ? "" : "s"} marked active`)
      onDone()
    })
  }

  return (
    <Button
      type="button"
      variant="success"
      size="sm"
      className="gap-2"
      onClick={handleUnarchive}
      disabled={isPending}
    >
      <ArchiveRestore className="h-4 w-4" />
      {isPending ? "Unarchiving..." : `Unarchive (${selectedIds.length})`}
    </Button>
  )
}
