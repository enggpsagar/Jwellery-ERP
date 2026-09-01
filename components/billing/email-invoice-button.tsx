"use client"

import { useTransition } from "react"
import { Mail } from "lucide-react"

import { emailInvoiceAction } from "@/lib/actions/invoice-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"

export function EmailInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const handleClick = () => {
    startTransition(async () => {
      const result = await emailInvoiceAction(invoiceId)
      if (result.success) {
        toast.success(result.message)
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
        <Mail className="h-4 w-4 mr-1" />
      )}
      Email Invoice
    </Button>
  )
}
