// FILE PATH: app/(dashboard)/karigars/[id]/page.tsx

import { notFound } from "next/navigation";
import Link from "next/link";

import { getKarigarById } from "@/lib/actions/karigar-actions";
import { getKarigarLedger } from "@/lib/actions/ledger-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";
import { getStoreLocations } from "@/lib/actions/store-location-actions";
import { getLocationScope, locationWhere } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";

import { PageBackHeader } from "@/components/shared/page-back-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IssueMaterialDialog } from "@/components/karigars/issue-material-dialog";
import { RecordKarigarPaymentDialog } from "@/components/karigars/record-karigar-payment-dialog";
import { KarigarLedgerTable } from "@/components/karigars/karigar-ledger-table";

type Props = {
  params: Promise<{ id: string }>;
};

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function KarigarDetailPage({ params }: Props) {
  const { id } = await params;

  const karigar = await getKarigarById(id);
  if (!karigar) {
    notFound();
  }

  const storeId = await requireStoreScope();

  const scope = await getLocationScope();

  const [ledger, metals, locations, openJobs] = await Promise.all([
    getKarigarLedger(id),
    getStoreMetals(),
    getStoreLocations(),
    prisma.karigarJob.findMany({
      where: { storeId, karigarId: id, status: "issued", ...locationWhere(scope) },
      orderBy: { issueDate: "desc" },
    }),
  ]);

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={karigar.name}
        description={`Karigar code: ${karigar.code || "-"} · Mobile: ${karigar.mobile || "-"}`}
        backHref="/karigars"
        backLabel="Back to Karigars"
        action={
          <div className="flex flex-wrap gap-2">
            <IssueMaterialDialog karigarId={id} metals={metals} locations={locations} />
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

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={karigar.isActive ? "secondary" : "outline"}>
              {karigar.isActive ? "Active" : "Inactive"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {openJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open jobs — issue material to start a new job.
            </p>
          ) : (
            openJobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="font-medium">{job.jobNumber ?? job.id}</div>
                  <div className="text-sm text-muted-foreground">
                    Issued {formatDate(job.issueDate)} · {job.issueWeight ? Number(job.issueWeight) : 0}g{" "}
                    {job.issuePurity ?? ""} ({job.issueFineWeight ? Number(job.issueFineWeight).toFixed(3) : "0.000"}g fine)
                    {job.expectedDate ? ` · Expected ${formatDate(job.expectedDate)}` : ""}
                  </div>
                  {job.issueWeight && Number(job.receiveWeight ?? 0) > 0 && (
                    <div className="text-sm font-medium text-amber-700">
                      {Number(job.receiveWeight).toFixed(3)}g received so far ·{" "}
                      {Math.max(0, Number(job.issueWeight) - Number(job.receiveWeight)).toFixed(3)}g remaining
                    </div>
                  )}
                </div>
                <Link href={`/karigars/${id}/receive-items/${job.id}`}>
                  <Button type="button" size="sm">
                    Receive Items
                  </Button>
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Karigar Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <KarigarLedgerTable
            rows={ledger.rows}
            finalFineGoldBalance={ledger.finalFineGoldBalance}
            finalCashBalance={ledger.finalCashBalance}
          />
        </CardContent>
      </Card>
    </main>
  );
}
