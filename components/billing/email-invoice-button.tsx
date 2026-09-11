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
    <Button
      size="icon"
      onClick={handleClick}
      disabled={pending}
      title="Email Invoice"
      aria-label="Email Invoice"
      variant="outline"
      className="border-transparent bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700"
    >
      {pending ? <Loader className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
    </Button>
  )
}
