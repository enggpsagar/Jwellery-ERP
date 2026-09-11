"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { cancelDraftOrder } from "@/lib/actions/draft-order-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"

export function CancelDraftOrderButton({ orderId }: { orderId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  if (!confirming) {
    return (
      <Button type="button" variant="warning" onClick={() => setConfirming(true)}>
        Cancel Order
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Cancel this order?</span>
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>
        No
      </Button>
      <Button
        type="button"
        variant="warning"
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await cancelDraftOrder(orderId)
            if (result.success) {
              toast.success(result.message || "Order cancelled")
              router.refresh()
            } else {
              toast.error(result.message)
            }
          })
        }}
      >
        {isPending ? "Cancelling..." : "Yes, Cancel"}
      </Button>
    </div>
  )
}
