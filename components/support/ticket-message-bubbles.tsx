import { cn } from "@/lib/utils"
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
          </div>
        </div>
      ))}
    </div>
  )
}
