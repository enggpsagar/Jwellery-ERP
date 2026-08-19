"use client"

import { useTransition } from "react"
import { Mail, Loader2 } from "lucide-react"

import { emailKachaInvoiceAction } from "@/lib/actions/kacha-invoice-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"

export function EmailKachaInvoiceButton({ kachaInvoiceId }: { kachaInvoiceId: string }) {
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const handleClick = () => {
    startTransition(async () => {
      const result = await emailKachaInvoiceAction(kachaInvoiceId)
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
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <Mail className="h-4 w-4 mr-1" />
      )}
      Email Slip
    </Button>
  )
}
