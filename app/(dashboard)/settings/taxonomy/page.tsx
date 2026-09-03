import type { Metadata } from "next";
import { UserRole } from "@prisma/client";

import { getStoreMetals, getStoreCategories } from "@/lib/actions/taxonomy-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { TaxonomySettingsForm } from "@/components/settings/taxonomy-settings-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "Taxonomy Settings",
};

export default async function TaxonomySettingsPage() {
  const [metals, categories, currentUser] = await Promise.all([
    getStoreMetals(),
    getStoreCategories(),
    getCurrentUser(),
  ]);

  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Metals, Stones & Categories"
        description="Define the metals, stones, categories, and item types your store deals in."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="taxonomy" />

      <TaxonomySettingsForm
        metals={metals}
        categories={categories}
        canEdit={canEdit}
      />
    </main>
  );
}
