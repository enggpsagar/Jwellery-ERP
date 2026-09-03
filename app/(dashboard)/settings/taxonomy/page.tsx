import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getStoreMetals, getStoreCategories } from "@/lib/actions/taxonomy-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { TaxonomySettingsForm } from "@/components/settings/taxonomy-settings-form";
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

  const [metals, categories] = await Promise.all([
    getStoreMetals(),
    getStoreCategories(),
  ]);

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
