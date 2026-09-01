"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

import { deleteQuotation } from "@/lib/actions/quotation-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"

export function DeleteQuotationButton({
  quotationId,
  quotationNumber,
}: {
  quotationId: string
  quotationNumber: string
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  const handleClick = () => {
    if (!confirm(`Delete quotation ${quotationNumber}? This cannot be undone.`)) {
      return
    }

    startTransition(async () => {
      const result = await deleteQuotation(quotationId)
      if (result.success) {
        toast.success(result.message)
        router.push("/quotations")
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? (
        <Loader className="h-4 w-4 mr-1" />
      ) : (
        <Trash2 className="h-4 w-4 mr-1" />
      )}
      Delete
    </Button>
  )
}
