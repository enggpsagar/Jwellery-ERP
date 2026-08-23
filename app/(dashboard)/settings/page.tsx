import Link from "next/link";
import { UserRole } from "@prisma/client";

import { getBusinessSettings } from "@/lib/actions/settings-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { SettingsForm } from "@/components/settings/settings-form";
import { PageBackHeader } from "@/components/shared/page-back-header";

export default async function SettingsPage() {
  const [settings, currentUser] = await Promise.all([
    getBusinessSettings(),
    getCurrentUser(),
  ]);

  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Settings"
        description="Manage your business profile, GST details, and invoice preferences."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <div className="flex gap-4 border-b text-sm">
        <Link href="/settings" className="border-b-2 border-primary px-1 pb-2 font-medium">
          Business Settings
        </Link>
        <Link href="/settings/purity" className="px-1 pb-2 text-muted-foreground hover:text-foreground">
          Purity &amp; Carat
        </Link>
      </div>

      <SettingsForm settings={settings} canEdit={canEdit} />
    </main>
  );
}