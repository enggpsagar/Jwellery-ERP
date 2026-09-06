// FILE PATH: app/(dashboard)/karigars/new/page.tsx

import type { Metadata } from "next";

import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions";
import { getStates } from "@/lib/actions/location-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";
import { getBusinessSettings } from "@/lib/actions/settings-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { KarigarCreateForm } from "@/components/karigars/karigar-create-form";

export const metadata: Metadata = {
  title: "Add Karigar",
};

export default async function NewKarigarPage() {
  const [locations, states, metals, defaultLocationId, settings] = await Promise.all([
    getStoreLocations(),
    getStates(),
    getStoreMetals(),
    getDefaultLocationId(),
    getBusinessSettings(),
  ]);

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Add Karigar"
        description="Register a new jewellery artisan."
        backHref="/karigars"
        backLabel="Back to Karigars"
      />

      <KarigarCreateForm
        locations={locations}
        states={states}
        metals={metals}
        defaultLocationId={defaultLocationId}
        defaultState={settings.state}
        defaultCity={settings.city}
      />
    </main>
  );
}