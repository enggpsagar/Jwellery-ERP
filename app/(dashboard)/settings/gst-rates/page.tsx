import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getGstRates } from "@/lib/actions/gst-rate-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { GstRateSettingsForm } from "@/components/settings/gst-rate-settings-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "GST Rates",
};

export default async function GstRateSettingsPage() {
  const currentUser = await getCurrentUser();

  // Admin/Super Admin only — see the matching comment in ../page.tsx.
  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;
  if (!canEdit) redirect("/dashboard");

  const rates = await getGstRates();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title="GST Rates"
        description="Define the GST rates your store applies on Invoices, Purchases, and Quotations."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="gst-rates" />

      <GstRateSettingsForm rates={rates} canEdit={canEdit} />
    </main>
  );
}
