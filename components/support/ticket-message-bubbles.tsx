import { FileText } from "lucide-react"

import { cn } from "@/lib/utils"
import { ticketAttachmentKind } from "@/lib/ticket-attachments"
import type { TicketMessageRow } from "@/lib/actions/support-ticket-actions"

function formatMessageTime(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}

/**
 * A message's optional attachment (see SupportTicketMessage's own doc
 * comment in prisma/schema.prisma) — rendered by kind: an image as a
 * clickable inline thumbnail (opens the full-size blob in a new tab), a PDF
 * as a "View PDF" link, a video as an inline player. Every kind always
 * shows the original filename, since the blob's own URL carries a random
 * suffix rather than the name the submitter actually recognizes.
 */
function TicketAttachmentView({
  url,
  name,
  mimeType,
}: {
  url: string
  name: string
  mimeType: string
}) {
  const kind = ticketAttachmentKind(mimeType)

  if (kind === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary
            Vercel Blob host, not one of next/image's configured domains */}
        <img
          src={url}
          alt={name}
          className="max-h-56 max-w-full rounded-md border object-contain"
        />
        <span className="mt-1 block truncate text-xs text-muted-foreground">{name}</span>
      </a>
    )
  }

  if (kind === "video") {
    return (
      <div className="mt-2">
        <video controls src={url} className="max-h-64 max-w-full rounded-md border" />
        <span className="mt-1 block truncate text-xs text-muted-foreground">{name}</span>
      </div>
    )
  }

  // PDF (or anything else that slipped through with a URL/name set).
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">View PDF — {name}</span>
    </a>
  )
}

/**
 * A ticket thread's messages, aligned left/right by `isFromSuperAdmin` —
 * shared by the SUPER_ADMIN inbox's detail view and a submitter's own
 * "My Tickets" thread, so both sides see the same conversation laid out
 * the same way.
 */
export function TicketMessageBubbles({ messages }: { messages: TicketMessageRow[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages yet.</p>
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn("flex", message.isFromSuperAdmin ? "justify-start" : "justify-end")}
        >
          <div
            className={cn(
              "max-w-[85%] rounded-xl border px-3.5 py-2.5 text-sm sm:max-w-[70%]",
              message.isFromSuperAdmin
                ? "bg-muted"
                : "bg-[color-mix(in_oklab,var(--chart-2)_10%,transparent)]",
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {message.isFromSuperAdmin ? "Support Team" : message.authorName}
              </span>
              <span>{formatMessageTime(message.createdAt)}</span>
            </div>
            {/* message.body is TipTap-authored HTML from the same
                RichTextEditor used for Contact Us/FAQ content, submitted by
                either a signed-in user or a Super Admin — never raw
                unauthenticated input, since even the anonymous public form
                only ever creates the FIRST message, and that path renders
                through this same component too (an anonymous visitor's own
                typed text, same trust level as any other user-authored
                content this app already renders unsanitized elsewhere, e.g.
                ContactContentView). */}
            <div
              className="prose prose-sm max-w-none [&_ol]:list-decimal [&_ol]:pl-5 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: message.body }}
            />
            {message.attachmentUrl && message.attachmentName && message.attachmentMimeType ? (
              <TicketAttachmentView
                url={message.attachmentUrl}
                name={message.attachmentName}
                mimeType={message.attachmentMimeType}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
