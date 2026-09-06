import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import {
  getPurityFineness,
  getCaratConversionRates,
  getMetalSellingRates,
} from "@/lib/actions/purity-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { PuritySettingsForm } from "@/components/settings/purity-settings-form";
import { CaratConversionForm } from "@/components/settings/carat-conversion-form";
import { MetalSellingRateForm } from "@/components/settings/metal-selling-rate-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "Purity Settings",
};

export default async function PuritySettingsPage() {
  const currentUser = await getCurrentUser();

  // Admin/Super Admin only — see the matching comment in ../page.tsx.
  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;
  if (!canEdit) redirect("/dashboard");

  const [rows, caratRows, sellingRateRows] = await Promise.all([
    getPurityFineness(),
    getCaratConversionRates(),
    getMetalSellingRates(),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title="Purity & Carat Settings"
        description="Define the fine-metal percentage used to convert weights across purities."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="purity" />

      <PuritySettingsForm rows={rows} canEdit={canEdit} />

      <CaratConversionForm rows={caratRows} canEdit={canEdit} />

      <MetalSellingRateForm rows={sellingRateRows} canEdit={canEdit} />
    </main>
  );
}
