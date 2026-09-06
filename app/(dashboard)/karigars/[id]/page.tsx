// FILE PATH: app/(dashboard)/karigars/[id]/page.tsx

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getKarigarDetailBundle } from "@/lib/actions/karigar-actions";
import { toTitleCase } from "@/lib/utils";

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
    return { title: bundle?.karigar.name ?? "Artisan" };
  } catch {
    return { title: "Artisan" };
  }
}

export default async function KarigarDetailPage({ params }: Props) {
  const { id } = await params;

  const bundle = await getKarigarDetailBundle(id);
  if (!bundle) {
    notFound();
  }

  const { karigar, metals, locations, defaultLocationId, materialCounts } = bundle;

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={toTitleCase(karigar.name)}
        description={`Artisan code: ${karigar.code || "-"} · Mobile: ${karigar.mobile || "-"}`}
        backHref="/karigars"
        backLabel="Back to Artisans"
        action={
          <div className="flex flex-wrap gap-2">
            <IssueMaterialDialog
              karigarId={id}
              metals={metals}
              assignedMetalTypeIds={karigar.assignedMetalTypeIds}
              locations={locations}
              defaultLocationId={defaultLocationId}
              count={materialCounts.issuedCount}
            />
            <ReceiveMaterialDialog
              karigarId={id}
              metals={metals}
              assignedMetalTypeIds={karigar.assignedMetalTypeIds}
              locations={locations}
              defaultLocationId={defaultLocationId}
              count={materialCounts.receivedCount}
            />
            <RecordKarigarPaymentDialog karigarId={id} />
          </div>
        }
      />

      <KarigarDetailContent bundle={bundle} />
    </main>
  );
}
