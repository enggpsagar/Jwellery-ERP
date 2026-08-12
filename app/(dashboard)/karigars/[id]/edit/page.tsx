// FILE PATH: app/(dashboard)/karigars/[id]/edit/page.tsx

import { notFound } from "next/navigation";

import { getKarigarById } from "@/lib/actions/karigar-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { KarigarEditForm } from "@/components/karigars/karigar-edit-form";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditKarigarPage({ params }: Props) {
  const { id } = await params;
  const karigar = await getKarigarById(id);

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

      <KarigarEditForm karigar={karigar} />
    </main>
  );
}