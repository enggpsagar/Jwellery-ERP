"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

import { deleteProduct } from "@/lib/actions/inventory/product-actions"
import { Button } from "@/components/ui/button"

type DeleteProductButtonProps = {
  productId: string
  productName: string
}

export function DeleteProductButton({
  productId,
  productName,
}: DeleteProductButtonProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${productName}"?\n\nThis will only be allowed if no inventory / sale / karigar dependency exists.`
    )

    if (!confirmed) return

    startTransition(async () => {
      const result = await deleteProduct(productId)

      if (!result.success) {
        window.alert(result.message || "Unable to delete product")
        return
      }

      window.alert(result.message || "Product deleted successfully")
      router.refresh()
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleDelete}
      disabled={isPending}
      title="Delete product"
      className="text-red-600 hover:text-red-700"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )
}