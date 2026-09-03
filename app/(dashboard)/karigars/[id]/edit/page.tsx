// FILE PATH: app/(dashboard)/karigars/[id]/edit/page.tsx

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";

import { getKarigarById } from "@/lib/actions/karigar-actions";
import { getStoreLocations } from "@/lib/actions/store-location-actions";
import { getStates } from "@/lib/actions/location-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { KarigarEditForm } from "@/components/karigars/karigar-edit-form";

type Props = {
  params: Promise<{ id: string }>;
};

const getKarigar = cache(getKarigarById);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const karigar = await getKarigar(id);
    return { title: karigar ? `Edit ${karigar.name}` : "Edit Karigar" };
  } catch {
    return { title: "Edit Karigar" };
  }
}

export default async function EditKarigarPage({ params }: Props) {
  const { id } = await params;
  const [karigar, locations, states] = await Promise.all([
    getKarigar(id),
    getStoreLocations(),
    getStates(),
  ]);

  if (!karigar) {
    notFound();
  }

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Edit Karigar"
        description={`Update details for ${karigar.name}.`}
        backHref="/karigars"
        backLabel="Back to Karigars"
      />

      <KarigarEditForm karigar={karigar} locations={locations} states={states} />
    </main>
  );
}