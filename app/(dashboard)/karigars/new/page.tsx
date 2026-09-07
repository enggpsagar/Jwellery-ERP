// FILE PATH: app/(dashboard)/karigars/new/page.tsx

import type { Metadata } from "next";

import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions";
import { getStates } from "@/lib/actions/location-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";
import { getBusinessSettings } from "@/lib/actions/settings-actions";

import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper";
import { KarigarCreateForm } from "@/components/karigars/karigar-create-form";

export const metadata: Metadata = {
  title: "Add Artisan",
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
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <ResetFormWrapper
        header={{
          title: "Add Karigar",
          description: "Register a new jewellery artisan.",
          backHref: "/karigars",
          backLabel: "Back to Artisans",
        }}
      >
        <KarigarCreateForm
          locations={locations}
          states={states}
          metals={metals}
          defaultLocationId={defaultLocationId}
          defaultState={settings.state}
          defaultCity={settings.city}
          gstScheme={settings.gstScheme}
        />
      </ResetFormWrapper>
    </main>
  );
}