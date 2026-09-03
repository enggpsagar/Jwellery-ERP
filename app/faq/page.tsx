import type { Metadata } from "next"

import { getPlatformFaqs } from "@/lib/actions/platform-content-actions"
import { FaqList } from "@/components/public/faq-list"
import {
  PublicSiteFooter,
  PublicSiteHeader,
} from "@/components/public/public-site-chrome"

export const metadata: Metadata = {
  title: "FAQ",
}

export const dynamic = "force-dynamic"

/**
 * Public FAQ page — no session required (excluded from the auth middleware
 * matcher, same as /login and /register). Only published entries render;
 * drafts stay visible to a Super Admin at /platform-content until toggled
 * live.
 */
export default async function FaqPage() {
  const faqs = await getPlatformFaqs({ publishedOnly: true })

  return (
    <div className="min-h-svh bg-background">
      <PublicSiteHeader />

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Frequently Asked Questions
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Answers to the questions we hear most often. Can't find what you're
          looking for? <a href="/contact" className="underline underline-offset-2 hover:text-foreground">Contact us</a>.
        </p>

        <div className="mt-10 rounded-2xl border bg-card p-6 sm:p-8">
          <FaqList faqs={faqs} />
        </div>
      </section>

      <PublicSiteFooter />
    </div>
  )
}
