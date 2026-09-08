import type { Metadata } from "next"
import { UserRole } from "@prisma/client"
import { redirect } from "next/navigation"

import { getCollaborationCodeSettings } from "@/lib/actions/store-collaboration-actions"
import { getCurrentUser } from "@/lib/auth/auth"

import { CollaborationCodeSettingsForm } from "@/components/settings/collaboration-code-settings-form"
import { SettingsTabs } from "@/components/settings/settings-tabs"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "Collaboration",
}

export default async function CollaborationSettingsPage() {
  const currentUser = await getCurrentUser()

  // Store Owner (ADMIN) only — deliberately NOT also SUPER_ADMIN, unlike
  // every other settings page. A Super Admin generating their own access
  // code would defeat the entire point of the owner controlling
  // authorization — see getCollaborationCodeSettings' own doc comment.
  if (currentUser?.role !== UserRole.ADMIN) redirect("/dashboard")

  const settings = await getCollaborationCodeSettings()

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title="Collaboration"
        description="Control when a Super Admin can access this store's data — they need a code from you first, every time you choose to grant it."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="collaboration" role={currentUser.role} />

      <CollaborationCodeSettingsForm initial={settings} />
    </main>
  )
}
