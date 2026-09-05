// FILE PATH: app/(dashboard)/karigars/new/page.tsx

import type { Metadata } from "next";

import { getStoreLocations } from "@/lib/actions/store-location-actions";
import { getStates } from "@/lib/actions/location-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { KarigarCreateForm } from "@/components/karigars/karigar-create-form";

export const metadata: Metadata = {
  title: "Add Karigar",
};

export default async function NewKarigarPage() {
  const [locations, states, metals] = await Promise.all([
    getStoreLocations(),
    getStates(),
    getStoreMetals(),
  ]);

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Add Karigar"
        description="Register a new jewellery artisan."
        backHref="/karigars"
        backLabel="Back to Karigars"
      />

      <KarigarCreateForm locations={locations} states={states} metals={metals} />
    </main>
  );
}