import { getBusinessSettings } from "@/lib/actions/settings-actions";

import { SettingsForm } from "@/components/settings/settings-form";
import { PageBackHeader } from "@/components/shared/page-back-header";

export default async function SettingsPage() {
  const settings = await getBusinessSettings();

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Settings"
        description="Manage your business profile, GST details, and invoice preferences."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsForm settings={settings} />
    </main>
  );
}