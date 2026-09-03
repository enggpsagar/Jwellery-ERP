import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth/auth"
import { UserRole } from "@prisma/client"
import {
  getPlatformContactContent,
  getPlatformFaqs,
} from "@/lib/actions/platform-content-actions"
import { ContactContentForm } from "@/components/platform-content/contact-content-form"
import { FaqManager } from "@/components/platform-content/faq-manager"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Contact & FAQ",
}

export const dynamic = "force-dynamic"

/**
 * SUPER_ADMIN editor for the platform-wide Contact Us content and FAQ list
 * shown on the public site (/contact, /faq) and the app's own /help page.
 *
 * Gated three ways, matching this app's defense-in-depth convention:
 *  1. middleware.ts redirects any non-SUPER_ADMIN request to this path
 *     (same pattern as /stores).
 *  2. This page itself re-checks the session and redirects — belt-and-
 *     braces alongside the middleware check, since /stores and /plans
 *     don't otherwise agree on whether the page itself checks too.
 *  3. Every mutating action in lib/actions/platform-content-actions.ts
 *     calls requireRole(UserRole.SUPER_ADMIN) independently, so even a
 *     request that reached the action directly (bypassing both page-level
 *     checks) is still refused.
 */
export default async function PlatformContentPage() {
  const user = await getCurrentUser()

  if (!user || user.role !== UserRole.SUPER_ADMIN) {
    redirect("/dashboard")
  }

  const [content, faqs] = await Promise.all([
    getPlatformContactContent(),
    getPlatformFaqs(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Contact & FAQ</h1>
        <p className="text-muted-foreground">
          Platform-wide content — the same Contact Us message and FAQ list
          every store's users and every public-site visitor see. Not a
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
    </div>
  )
}
