// FILE PATH: app/(dashboard)/karigars/[id]/page.tsx

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getKarigarDetailBundle } from "@/lib/actions/karigar-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { IssueMaterialDialog } from "@/components/karigars/issue-material-dialog";
import { ReceiveMaterialDialog } from "@/components/karigars/receive-material-dialog";
import { RecordKarigarPaymentDialog } from "@/components/karigars/record-karigar-payment-dialog";
import { KarigarDetailContent } from "@/components/karigars/karigar-detail-content";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const bundle = await getKarigarDetailBundle(id);
    return { title: bundle?.karigar.name ?? "Karigar" };
  } catch {
    return { title: "Karigar" };
  }
}

export default async function KarigarDetailPage({ params }: Props) {
  const { id } = await params;

  const bundle = await getKarigarDetailBundle(id);
  if (!bundle) {
    notFound();
  }

  const { karigar, metals, locations, defaultLocationId } = bundle;

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={karigar.name}
        description={`Karigar code: ${karigar.code || "-"} · Mobile: ${karigar.mobile || "-"}`}
        backHref="/karigars"
        backLabel="Back to Karigars"
        action={
          <div className="flex flex-wrap gap-2">
            <IssueMaterialDialog
              karigarId={id}
              metals={metals}
              locations={locations}
              defaultLocationId={defaultLocationId}
            />
            <ReceiveMaterialDialog
              karigarId={id}
              metals={metals}
              locations={locations}
              defaultLocationId={defaultLocationId}
            />
            <RecordKarigarPaymentDialog karigarId={id} />
          </div>
        }
      />

      <KarigarDetailContent bundle={bundle} />
    </main>
  );
}
