import type { Metadata } from "next";
import { UserRole } from "@prisma/client";

import { getBusinessSettings } from "@/lib/actions/settings-actions";
import { getCurrentUser } from "@/lib/auth/auth";
import { getStates } from "@/lib/actions/location-actions";

import { SettingsForm } from "@/components/settings/settings-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const [settings, currentUser, states] = await Promise.all([
    getBusinessSettings(),
    getCurrentUser(),
    getStates(),
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

      <SettingsTabs active="business" />

      <SettingsForm settings={settings} canEdit={canEdit} states={states} />
    </main>
  );
}