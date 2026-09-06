"use client"

import { useState } from "react"
import { Loader2, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/providers/toast-provider"

type ShareWhatsAppButtonProps = {
  phone: string | null | undefined
  message: string
  /** Used to fetch the generated invoice PDF from /api/billing/[id]/pdf.
   * Omitted by callers with nothing to attach yet (e.g. quotations) — the
   * button then falls back to a plain text-only wa.me share, same as
   * before this ever attached a file. */
  invoiceId?: string
  invoiceNumber?: string
}

/**
 * "Share on WhatsApp" — sends the actual invoice PDF as an attachment where
 * the platform allows it, not just a text message.
 *
 * WhatsApp's own wa.me click-to-chat URL has no attachment parameter at
 * all — that's a platform limitation, not something fixable client-side.
 * The only way to hand WhatsApp a real file from a web page is the Web
 * Share API's file support (`navigator.share({ files })`), which opens the
 * OS share sheet with WhatsApp as one of the targets; picking it attaches
 * the PDF for real. That API is mobile-browser-only (Chrome/Safari on
 * Android/iOS) — desktop browsers fall back to downloading the PDF and
 * opening wa.me with the text so it can still be attached manually.
 */
export function ShareWhatsAppButton({
  phone,
  message,
  invoiceId,
  invoiceNumber,
}: ShareWhatsAppButtonProps) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  const digits = (phone ?? "").replace(/\D/g, "")
  const whatsappNumber = digits.length === 10 ? `91${digits}` : digits

  async function handleClick() {
    if (!whatsappNumber || loading) return

    const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`

    // Nothing to attach (e.g. a quotation) — same plain link this button
    // always used, no PDF round-trip.
    if (!invoiceId || !invoiceNumber) {
      window.open(waUrl, "_blank")
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/billing/${invoiceId}/pdf`)
      if (!response.ok) throw new Error("Failed to generate invoice PDF")

      const blob = await response.blob()
      const file = new File([blob], `${invoiceNumber}.pdf`, { type: "application/pdf" })

      // Web Share API with files — real attachment, WhatsApp included as a
      // share target on supporting mobile browsers.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Invoice ${invoiceNumber}`,
          text: message,
        })
        return
      }

      // No file-sharing support (desktop browsers, mainly): download the
      // PDF and open the text chat so it can be attached by hand — the
      // honest fallback rather than silently sending text-only.
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = `${invoiceNumber}.pdf`
      link.click()
      URL.revokeObjectURL(downloadUrl)

      toast.info(
        "Your browser can't attach files to WhatsApp directly — the invoice PDF has been downloaded. Attach it in the chat that just opened.",
      )
      window.open(waUrl, "_blank")
    } catch (error) {
      // A user cancelling the native share sheet also lands here (AbortError)
      // — not a real failure, so it stays quiet instead of showing an error.
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.error(error instanceof Error ? error.message : "Failed to share invoice")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={!digits || loading}
      title={!digits ? "This customer has no phone number on file" : undefined}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <MessageCircle className="h-4 w-4 mr-1" />
      )}
      Share on WhatsApp
    </Button>
  )
}
