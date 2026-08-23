import { UserRole } from "@prisma/client";

import { getPurityFineness } from "@/lib/actions/purity-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { PuritySettingsForm } from "@/components/settings/purity-settings-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageBackHeader } from "@/components/shared/page-back-header";

export default async function PuritySettingsPage() {
  const [rows, currentUser] = await Promise.all([
    getPurityFineness(),
    getCurrentUser(),
  ]);

  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Purity & Carat Settings"
        description="Define the fine-metal percentage used to convert weights across purities."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="purity" />

      <PuritySettingsForm rows={rows} canEdit={canEdit} />
    </main>
  );
}
