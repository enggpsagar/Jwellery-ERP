// FILE PATH: app/(dashboard)/karigars/new/page.tsx

import { getStoreLocations } from "@/lib/actions/store-location-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { KarigarCreateForm } from "@/components/karigars/karigar-create-form";

export default async function NewKarigarPage() {
  const locations = await getStoreLocations();

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Add Karigar"
        description="Register a new jewellery artisan."
        backHref="/karigars"
        backLabel="Back to Karigars"
      />

      <KarigarCreateForm locations={locations} />
    </main>
  );
}