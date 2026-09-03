import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth/auth"
import { UserRole } from "@prisma/client"
import {
  getPlatformContactContent,
  getPlatformFaqs,
} from "@/lib/actions/platform-content-actions"
import {
  getMyContactDefaults,
  getMyTickets,
} from "@/lib/actions/support-ticket-actions"
import { ContactContentView } from "@/components/public/contact-content-view"
import { FaqList } from "@/components/public/faq-list"
import { ContactContentForm } from "@/components/platform-content/contact-content-form"
import { FaqManager } from "@/components/platform-content/faq-manager"
import { SupportTicketForm } from "@/components/support/support-ticket-form"
import { MyTickets } from "@/components/support/my-tickets"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Contact & FAQ",
}

export const dynamic = "force-dynamic"

type ContactFaqPageProps = {
  searchParams?: Promise<{ ticket?: string }>
}

/**
 * The application's single Contact & FAQ destination — reachable from the
 * header's Account menu (components/dashboard/top-bar.tsx) by every
 * signed-in role, replacing the two separate pages this used to be split
 * across: /help (a read-only view, all users) and /platform-content (the
 * SUPER_ADMIN-only editor). Both are now gone; this page shows the read
 * view to everyone, and additionally the management forms — inline,
 * further down the same page — only to a SUPER_ADMIN.
 *
 * Content itself is still platform-wide and SUPER_ADMIN-edited only (see
 * lib/actions/platform-content-actions.ts's own doc comment for why it
 * deliberately has no storeId) — merging the two pages didn't change who
 * can write, only where a SUPER_ADMIN goes to do it.
 */
export default async function ContactFaqPage({ searchParams }: ContactFaqPageProps) {
  const user = await getCurrentUser()
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN
  const params = (await searchParams) ?? {}

  // This route is reachable without a session (see the module doc comment
  // on middleware.ts's matcher — "/contact-faq" starts with the same
  // "contact"/"faq" substrings that public page is deliberately excluded
  // from auth on, so an anonymous visitor can land here too). The read-only
  // sections above have always tolerated that (getCurrentUser() is null but
  // nothing throws); the ticket submission/My Tickets sections below are
  // genuinely account-bound, so they're skipped entirely rather than
  // calling requireAuth()-backed actions that would throw for no session.
  const [content, faqs, contactDefaults, myTickets] = await Promise.all([
    getPlatformContactContent(),
    // SUPER_ADMIN sees every entry (including drafts) so the management
    // list below reflects reality; everyone else only ever gets published
    // ones, same as the FAQ list itself has always shown.
    getPlatformFaqs(isSuperAdmin ? {} : { publishedOnly: true }),
    user ? getMyContactDefaults() : Promise.resolve(null),
    user ? getMyTickets() : Promise.resolve(null),
  ])

  const publishedFaqs = isSuperAdmin ? faqs.filter((faq) => faq.isPublished) : faqs

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contact & FAQ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answers to common questions, and how to reach us if you're still stuck.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <FaqList faqs={publishedFaqs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Us</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactContentView content={content} />
        </CardContent>
      </Card>

      {user && contactDefaults ? (
        <Card>
          <CardHeader>
            <CardTitle>Submit a Support Ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <SupportTicketForm mode="authenticated" defaults={contactDefaults} />
          </CardContent>
        </Card>
      ) : null}

      {user && myTickets ? (
        <Card>
          <CardHeader>
            <CardTitle>My Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <MyTickets tickets={myTickets} initialExpandedId={params.ticket ?? null} />
          </CardContent>
        </Card>
      ) : null}

      {isSuperAdmin ? (
        <>
          <div className="pt-2">
            <h2 className="text-lg font-semibold tracking-tight">Manage Content</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Platform-wide — the same Contact Us message and FAQ list every
              store's users and every public-site visitor see. Not a
              per-store setting.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Contact Us Content</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactContentForm content={content} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>FAQ Entries</CardTitle>
            </CardHeader>
            <CardContent>
              <FaqManager faqs={faqs} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
