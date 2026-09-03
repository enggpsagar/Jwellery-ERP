import type { Metadata } from "next"

import {
  getPlatformContactContent,
  getPlatformFaqs,
} from "@/lib/actions/platform-content-actions"
import { ContactContentView } from "@/components/public/contact-content-view"
import { FaqList } from "@/components/public/faq-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Help & Support",
}

export const dynamic = "force-dynamic"

/**
 * The application's own Help & Support entry point — reachable by every
 * signed-in role (see the "Help & Support" nav entry in app-sidebar.tsx and
 * the /help exception in middleware.ts's KARIGAR_ALLOWED_PREFIXES).
 *
 * Renders inside the dashboard's own layout/chrome rather than reusing the
 * public /contact and /faq pages directly — a signed-in user staying inside
 * the app shell they're already in is a better fit here than dropping them
 * onto the public marketing site's header/footer. Both surfaces read the
 * exact same SUPER_ADMIN-edited content via the shared components/public/*
 * views, so there is nothing to keep in sync by hand.
 */
export default async function HelpPage() {
  const [content, faqs] = await Promise.all([
    getPlatformContactContent(),
    getPlatformFaqs({ publishedOnly: true }),
  ])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Help & Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answers to common questions, and how to reach us if you're still stuck.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <FaqList faqs={faqs} />
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
    </div>
  )
}
