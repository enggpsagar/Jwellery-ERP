import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { getSupportTicketForAdmin } from "@/lib/actions/support-ticket-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { AdminTicketDetail } from "@/components/support/admin-ticket-detail"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

type SupportTicketDetailPageProps = {
  params: Promise<{ id: string }>
}

const getTicket = cache(getSupportTicketForAdmin)

export async function generateMetadata({
  params,
}: SupportTicketDetailPageProps): Promise<Metadata> {
  try {
    const { id } = await params
    const ticket = await getTicket(id)
    return { title: ticket?.subject ?? "Support Ticket" }
  } catch {
    return { title: "Support Ticket" }
  }
}

/**
 * SUPER_ADMIN's single-ticket view: full thread, reply box, status changer.
 * getSupportTicketForAdmin itself re-checks SUPER_ADMIN — this page's own
 * route is also gated in middleware.ts, same defense-in-depth convention as
 * every other permission boundary in this app.
 */
export default async function SupportTicketDetailPage({ params }: SupportTicketDetailPageProps) {
  const { id } = await params
  const ticket = await getTicket(id)

  if (!ticket) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageBackHeader
        title={`${ticket.ticketNumber} · ${ticket.subject}`}
        description={`From ${ticket.submitterName} (${ticket.submitterEmail}, ${ticket.submitterPhone})${
          ticket.storeName ? ` · ${ticket.storeName}` : " · public site visitor"
        }`}
        backHref="/support-tickets"
        backLabel="All Tickets"
      />

      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTicketDetail ticket={ticket} />
        </CardContent>
      </Card>
    </div>
  )
}
