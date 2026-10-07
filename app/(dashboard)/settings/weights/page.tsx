import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getEffectiveAccess } from "@/lib/store-context";
import { getWeightSettingsPage } from "@/lib/actions/weight-settings-actions";

import { SettingsTabs } from "@/components/settings/settings-tabs";
import { WeightSettingsForm } from "@/components/settings/weight-settings-form";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "Weights",
};

export default async function WeightSettingsPage() {
  // Store Owner only — the role in the active store, same as the action.
  const access = await getEffectiveAccess();
  if (!access || (access.role !== UserRole.ADMIN && access.role !== UserRole.SUPER_ADMIN)) redirect("/dashboard");

  const data = await getWeightSettingsPage();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title="Weights"
        description="How net weight and fine (24K) weight are worked out, and how weights are rounded."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="weights" role={access.role} />

      <WeightSettingsForm initial={data.settings} initialJob={data.job} log={data.log} />
    </main>
  );
}
