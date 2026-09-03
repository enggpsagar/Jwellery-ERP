import type { Metadata } from "next"

import { getPlatformContactContent } from "@/lib/actions/platform-content-actions"
import { ContactContentView } from "@/components/public/contact-content-view"
import { SupportTicketForm } from "@/components/support/support-ticket-form"
import {
  PublicSiteFooter,
  PublicSiteHeader,
} from "@/components/public/public-site-chrome"

export const metadata: Metadata = {
  title: "Contact Us",
}

export const dynamic = "force-dynamic"

/**
 * Public Contact Us page — no session required (excluded from the auth
 * middleware matcher, same as /login and /register). Content is
 * platform-wide, edited by a Super Admin at /contact-faq.
 */
export default async function ContactPage() {
  const content = await getPlatformContactContent()

  return (
    <div className="min-h-svh bg-background">
      <PublicSiteHeader />

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Contact Us
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Questions about your store, billing, or getting started — we're
          happy to help.
        </p>

        <div className="mt-10 rounded-2xl border bg-card p-6 sm:p-8">
          <ContactContentView content={content} />
        </div>

        <div className="mt-8 rounded-2xl border bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight">Send us a message</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This creates a support ticket and we'll reply to the email address you provide. Signed-in
            users can track and reply to their tickets from Contact & FAQ inside the app.
          </p>
          <div className="mt-6">
            <SupportTicketForm mode="public" />
          </div>
        </div>
      </section>

      <PublicSiteFooter />
    </div>
  )
}
