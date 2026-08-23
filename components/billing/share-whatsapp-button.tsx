"use client"

import { MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

type ShareWhatsAppButtonProps = {
  phone: string | null | undefined
  message: string
}

/**
 * Client-only "Share on WhatsApp" button — no server action involved.
 * Sanitizes the phone number to digits, prepends the India country code
 * (91) for a bare 10-digit number, and opens wa.me with the pre-filled
 * message in a new tab. Disabled when there's no phone on file at all.
 */
export function ShareWhatsAppButton({ phone, message }: ShareWhatsAppButtonProps) {
  const digits = (phone ?? "").replace(/\D/g, "")
  const whatsappNumber = digits.length === 10 ? `91${digits}` : digits

  const handleClick = () => {
    if (!whatsappNumber) return
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
    window.open(url, "_blank")
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={!digits}
      title={!digits ? "This customer has no phone number on file" : undefined}
    >
      <MessageCircle className="h-4 w-4 mr-1" />
      Share on WhatsApp
    </Button>
  )
}
