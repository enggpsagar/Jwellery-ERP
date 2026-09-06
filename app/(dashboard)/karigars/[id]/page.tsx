// FILE PATH: app/(dashboard)/karigars/[id]/page.tsx

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";

import { getKarigarById } from "@/lib/actions/karigar-actions";
import { getKarigarLedger, getKarigarMaterialCounts } from "@/lib/actions/ledger-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IssueMaterialDialog } from "@/components/karigars/issue-material-dialog";
import { ReceiveMaterialDialog } from "@/components/karigars/receive-material-dialog";
import { RecordKarigarPaymentDialog } from "@/components/karigars/record-karigar-payment-dialog";
import { KarigarLedgerTabs } from "@/components/karigars/karigar-ledger-tabs";
import { KarigarStatusCard } from "@/components/karigars/karigar-status-card";
import { ExportMenu } from "@/components/shared/export-menu";
import { toTitleCase } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
};

const getKarigar = cache(getKarigarById);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const karigar = await getKarigar(id);
    return { title: karigar?.name ?? "Karigar" };
  } catch {
    return { title: "Karigar" };
  }
}

export default async function KarigarDetailPage({ params }: Props) {
  const { id } = await params;

  const karigar = await getKarigar(id);
  if (!karigar) {
    notFound();
  }

  const [ledger, metals, locations, defaultLocationId, materialCounts] = await Promise.all([
    getKarigarLedger(id),
    getStoreMetals(),
    getStoreLocations(),
    getDefaultLocationId(),
    getKarigarMaterialCounts(id),
  ]);

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={toTitleCase(karigar.name)}
        description={`Karigar code: ${karigar.code || "-"} · Mobile: ${karigar.mobile || "-"}`}
        backHref="/karigars"
        backLabel="Back to Karigars"
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Opening Gold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{karigar.openingGold}g</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Opening Cash</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">
              ₹ {karigar.openingCash.toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Specialization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{karigar.specialization || "-"}</div>
          </CardContent>
        </Card>

        <KarigarStatusCard karigarId={id} karigarName={karigar.name} isActive={karigar.isActive} />
      </div>

      {/* Live balances — Opening Gold/Cash above are this karigar's starting
          point; these are the current running totals from every ledger
          entry since, one glance answering "where do things stand right
          now" before anyone opens the full ledger below. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card
          size="sm"
          className={
            ledger.finalCashBalance > 0 ? "border-red-200 bg-red-50" : undefined
          }
        >
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Cash Balance (owed to karigar)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={
                ledger.finalCashBalance > 0
                  ? "text-xl font-semibold text-red-700"
                  : "text-xl font-semibold"
              }
            >
              ₹ {ledger.finalCashBalance.toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>

        {ledger.materialGroups.map((group) => (
          <Card
            key={group.metalTypeId ?? "unassigned"}
            size="sm"
            className={
              group.finalFineBalance > 0
                ? "border-red-200 bg-red-50"
                : group.finalFineBalance < 0
                  ? "border-emerald-200 bg-emerald-50"
                  : undefined
            }
          >
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                {group.metalLabel} Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={
                  group.finalFineBalance > 0
                    ? "text-xl font-semibold text-red-700"
                    : group.finalFineBalance < 0
                      ? "text-xl font-semibold text-emerald-700"
                      : "text-xl font-semibold"
                }
              >
                {group.finalFineBalance > 0
                  ? `Karigar owes ${group.finalFineBalance.toFixed(3)}g`
                  : group.finalFineBalance < 0
                    ? `You owe ${Math.abs(group.finalFineBalance).toFixed(3)}g`
                    : "Settled"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Karigar Ledger</CardTitle>
          <ExportMenu href={`/karigars/${id}/ledger-export`} label="Export Ledger" />
        </CardHeader>
        <CardContent>
          <KarigarLedgerTabs
            rows={ledger.rows}
            finalCashBalance={ledger.finalCashBalance}
            totalDebit={ledger.totalDebit}
            totalCredit={ledger.totalCredit}
            materialGroups={ledger.materialGroups}
          />
        </CardContent>
      </Card>
    </main>
  );
}
