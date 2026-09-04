"use client"

import { useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { Paperclip, X } from "lucide-react"

import {
  TICKET_ATTACHMENT_ALLOWED_TYPES,
  validateTicketAttachment,
} from "@/lib/ticket-attachments"
import { Label } from "@/components/ui/label"
import { Loader } from "@/components/ui/loader"
import { cn } from "@/lib/utils"

type UploadedAttachment = {
  url: string
  name: string
  mimeType: string
  size: number
}

type TicketAttachmentFieldProps = {
  /** Omitted for a brand-new ticket (no id yet) — blobs then land under
   *  `support-tickets/new/...` until the ticket itself exists. */
  ticketId?: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Keeps a blob pathname readable while stripping characters that would
 *  otherwise need URL-encoding in the resulting file URL. */
function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_")
}

/**
 * File picker for a support ticket message's single optional attachment
 * (image, PDF, or video/screen recording) — used by both the ticket
 * submission form and the shared reply box. On selection, uploads straight
 * from the browser to Vercel Blob via the client-upload flow (bypassing
 * this app's server entirely, since a screen recording can be far larger
 * than a serverless function's request body limit), then keeps the
 * resulting URL/metadata in state and mirrors it into hidden inputs — same
 * "React state shadows an imperative side effect into a hidden form field"
 * pattern components/shared/rich-text-editor.tsx already uses for TipTap,
 * so the surrounding form's plain `new FormData(form)` on submit picks it
 * up without any extra plumbing.
 *
 * Validates client-side first (lib/ticket-attachments.ts) for immediate
 * feedback on an obviously-wrong file — the server route
 * (app/api/support-tickets/upload/route.ts) re-validates before minting an
 * upload token regardless, since that's the actual enforcement boundary.
 *
 * The caller is expected to remount this component (via a changing `key`,
 * same convention RichTextEditor's own call sites already use) after a
 * successful submit, so a fresh picker starts empty for the next message.
 */
export function TicketAttachmentField({ ticketId }: TicketAttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null)

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared immediately so picking the exact same file again after
    // removing it still fires a change event.
    event.target.value = ""
    if (!file) return

    const clientError = validateTicketAttachment({ mimeType: file.type, size: file.size })
    if (clientError) {
      setError(clientError)
      setStatus("error")
      return
    }

    setError(null)
    setStatus("uploading")
    setProgress(0)

    try {
      const pathname = `support-tickets/${ticketId ?? "new"}/${Date.now()}-${sanitizeFilename(file.name)}`
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/support-tickets/upload",
        clientPayload: JSON.stringify({ mimeType: file.type, size: file.size }),
        onUploadProgress: (event) => setProgress(Math.round(event.percentage)),
      })

      setAttachment({ url: blob.url, name: file.name, mimeType: file.type, size: file.size })
      setStatus("idle")
    } catch (uploadError) {
      console.error("Ticket attachment upload error:", uploadError)
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed. Please try again.",
      )
      setStatus("error")
    }
  }

  function clearAttachment() {
    setAttachment(null)
    setError(null)
    setStatus("idle")
  }

  return (
    <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
      <Label>Attachment (optional)</Label>

      {attachment ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{attachment.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              ({formatBytes(attachment.size)})
            </span>
          </span>
          <button
            type="button"
            onClick={clearAttachment}
            aria-label="Remove attachment"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <label
            className={cn(
              "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground",
              status === "uploading" && "pointer-events-none opacity-60",
            )}
          >
            <Paperclip className="h-3.5 w-3.5" />
            Attach file
            <input
              ref={inputRef}
              type="file"
              accept={TICKET_ATTACHMENT_ALLOWED_TYPES.join(",")}
              onChange={handleFileChange}
              disabled={status === "uploading"}
              className="sr-only"
            />
          </label>

          {status === "uploading" ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader className="h-4 w-4" />
              Uploading… {progress}%
            </span>
          ) : null}
        </div>
      )}

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {!attachment && status !== "uploading" ? (
        <p className="text-xs text-muted-foreground">
          Images up to 5MB, PDF up to 10MB, video up to 100MB.
        </p>
      ) : null}

      {attachment ? (
        <>
          <input type="hidden" name="attachmentUrl" value={attachment.url} readOnly />
          <input type="hidden" name="attachmentName" value={attachment.name} readOnly />
          <input type="hidden" name="attachmentMimeType" value={attachment.mimeType} readOnly />
          <input type="hidden" name="attachmentSize" value={attachment.size} readOnly />
        </>
      ) : null}
    </div>
  )
}
