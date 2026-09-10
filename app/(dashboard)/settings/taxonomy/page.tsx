import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getStoreMetals, getStoreCategories } from "@/lib/actions/taxonomy-actions";
import { getBusinessSettings } from "@/lib/actions/settings-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { TaxonomySettingsForm } from "@/components/settings/taxonomy-settings-form";
import { SkuFormatForm } from "@/components/settings/sku-format-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "Taxonomy Settings",
};

export default async function TaxonomySettingsPage() {
  const currentUser = await getCurrentUser();

  // Admin/Super Admin only — see the matching comment in ../page.tsx.
  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;
  if (!canEdit) redirect("/dashboard");

  const [metals, categories, businessSettings] = await Promise.all([
    getStoreMetals(),
    getStoreCategories(),
    getBusinessSettings(),
  ]);

  const sampleMetal = metals.find((metal) => !metal.isGemstone && metal.isActive) ?? metals[0];
  const sampleCategory = categories.find((category) => category.isActive) ?? categories[0];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title="Metals, Stones & Categories"
        description="Define the metals, stones, categories, and item types your store deals in."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="taxonomy" role={currentUser?.role} />

      <TaxonomySettingsForm
        metals={metals}
        categories={categories}
        canEdit={canEdit}
      />

      <SkuFormatForm
        skuFormat={businessSettings.skuFormat}
        canEdit={canEdit}
        sampleMetalName={sampleMetal?.name ?? "Gold"}
        sampleCategoryName={sampleCategory?.name ?? "Ring"}
      />
    </main>
  );
}
