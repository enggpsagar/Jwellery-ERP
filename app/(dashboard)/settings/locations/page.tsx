import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getStoreLocations } from "@/lib/actions/store-location-actions";
import { getStates } from "@/lib/actions/location-actions";
import { getCurrentUser } from "@/lib/auth/auth";

import { LocationSettingsForm } from "@/components/settings/location-settings-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageBackHeader } from "@/components/shared/page-back-header";

export const metadata: Metadata = {
  title: "Locations",
};

export default async function LocationsSettingsPage() {
  const currentUser = await getCurrentUser();

  // Admin/Super Admin only — see the matching comment in ../page.tsx.
  const canEdit =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.SUPER_ADMIN;
  if (!canEdit) redirect("/dashboard");

  const [locations, states] = await Promise.all([
    getStoreLocations(),
    getStates(),
  ]);

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Locations"
        description="Define the physical locations your store keeps stock in."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <SettingsTabs active="locations" />

      <LocationSettingsForm locations={locations} states={states} canEdit={canEdit} />
    </main>
  );
}
