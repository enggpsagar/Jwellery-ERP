import type { Metadata } from "next"
import { UserRole } from "@prisma/client"
import { redirect } from "next/navigation"

import { getReportSettings } from "@/lib/actions/report-settings-actions"
import { getCurrentUser } from "@/lib/auth/auth"

import { ReportSettingsForm } from "@/components/settings/report-settings-form"
import { SettingsTabs } from "@/components/settings/settings-tabs"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "Reports & Notifications",
}

export default async function ReportsSettingsPage() {
  const currentUser = await getCurrentUser()

  // Admin/Super Admin only — see the matching comment in ../page.tsx.
  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN
  if (!canEdit) redirect("/dashboard")

  const settings = await getReportSettings()

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <PageBackHeader
        title="Reports & Notifications"
        description="Choose how often this store's trading summary is emailed, who receives it, or send one right now."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="reports" role={currentUser?.role} />

      <ReportSettingsForm initial={settings} />
    </main>
  )
}
