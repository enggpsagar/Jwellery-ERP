import Link from "next/link"

import type { KarigarDetailBundle } from "@/lib/actions/karigar-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { KarigarLedgerTabs } from "@/components/karigars/karigar-ledger-tabs"
import { KarigarStatusCard } from "@/components/karigars/karigar-status-card"
import { ExportMenu } from "@/components/shared/export-menu"

/**
 * The body of a karigar's detail view — balance cards, open jobs, and
 * ledger. Shared between the standalone /karigars/[id] page and the inline
 * detail pane on the Karigars list itself, so the two can never drift apart.
 */
export function KarigarDetailContent({ bundle }: { bundle: KarigarDetailBundle }) {
  const { karigar, ledger, openJobs } = bundle

  return (
    <div className="space-y-6">
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

        <KarigarStatusCard karigarId={karigar.id} karigarName={karigar.name} isActive={karigar.isActive} />
      </div>

      {/* Live balances — Opening Gold/Cash above are this karigar's starting
          point; these are the current running totals from every ledger
          entry since, one glance answering "where do things stand right
          now" before anyone opens the full ledger below. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          size="sm"
          className={ledger.finalCashBalance > 0 ? "border-red-200 bg-red-50" : undefined}
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
                    Issued {job.issueDate} · {job.issueWeight}g {job.issuePurity ?? ""} (
                    {job.issueFineWeight.toFixed(3)}g fine)
                    {job.expectedDate ? ` · Expected ${job.expectedDate}` : ""}
                  </div>
                  {job.issueWeight && job.receiveWeight > 0 && (
                    <div className="text-sm font-medium text-amber-700">
                      {job.receiveWeight.toFixed(3)}g received so far ·{" "}
                      {Math.max(0, job.issueWeight - job.receiveWeight).toFixed(3)}g remaining
                    </div>
                  )}
                </div>
                <Link href={`/karigars/${karigar.id}/receive-items/${job.id}`}>
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
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Karigar Ledger</CardTitle>
          <ExportMenu href={`/karigars/${karigar.id}/ledger-export`} label="Export Ledger" />
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
    </div>
  )
}
