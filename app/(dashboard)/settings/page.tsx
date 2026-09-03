import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getBusinessSettings } from "@/lib/actions/settings-actions";
import { getAvailableBusinessUnitOptions } from "@/lib/business-units.server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getStates } from "@/lib/actions/location-actions";

import { SettingsForm } from "@/components/settings/settings-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();

  // Admin/Super Admin only — already gated in middleware.ts, re-checked here
  // as the same defense-in-depth every other permission boundary in this app
  // uses (e.g. getAllSupportTickets/getSupportTicketForAdmin re-check
  // SUPER_ADMIN even though their routes are middleware-gated too).
  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;
  if (!canEdit) redirect("/dashboard");

  const [settings, states, businessUnitOptions] = await Promise.all([
    getBusinessSettings(),
    getStates(),
    getAvailableBusinessUnitOptions(),
  ]);

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Settings"
        description="Manage your business profile, GST details, and invoice preferences."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="business" />

      <SettingsForm
        settings={settings}
        canEdit={canEdit}
        states={states}
        unitOptions={businessUnitOptions}
      />
    </main>
  );
}