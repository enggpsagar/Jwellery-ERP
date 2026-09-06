import type { KarigarDetailBundle } from "@/lib/actions/karigar-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KarigarLedgerTabs } from "@/components/karigars/karigar-ledger-tabs"
import { KarigarStatusCard } from "@/components/karigars/karigar-status-card"
import { ExportMenu } from "@/components/shared/export-menu"

/**
 * The body of a karigar's detail view — balance cards and ledger. Shared
 * between the standalone /karigars/[id] page and the inline detail pane on
 * the Karigars list itself, so the two can never drift apart. No separate
 * "Open Jobs" section — Issue/Receive Material's own counts and the ledger
 * below already cover that.
 */
export function KarigarDetailContent({ bundle }: { bundle: KarigarDetailBundle }) {
  const { karigar, ledger } = bundle

  // Only what's actually set/nonzero — an unused Opening Gold/Cash field or
  // a karigar with no specialization recorded is clutter, not information.
  const hasOpeningGold = karigar.openingGold !== 0
  const hasOpeningCash = karigar.openingCash !== 0
  const hasSpecialization = Boolean(karigar.specialization)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {hasOpeningGold && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Opening Gold</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{karigar.openingGold}g</div>
              </CardContent>
            </Card>
          )}

          {hasOpeningCash && (
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
          )}

          {hasSpecialization && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Specialization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{karigar.specialization}</div>
              </CardContent>
            </Card>
          )}

        <KarigarStatusCard karigarId={karigar.id} karigarName={karigar.name} isActive={karigar.isActive} />
      </div>

      {/* Live balances — Opening Gold/Cash above are this karigar's starting
          point; these are the current running totals from every ledger
          entry since, one glance answering "where do things stand right
          now" before anyone opens the full ledger below. Cash balance is a
          single line, not a card — it's one number, and a box around it
          just eats space the metal cards next to it could use. Hidden
          entirely when settled (0) — nothing owed either way isn't worth a
          line on the page. */}
      {ledger.finalCashBalance !== 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Cash Balance (owed to karigar): </span>
          <span
            className={ledger.finalCashBalance > 0 ? "font-semibold text-red-700" : "font-semibold"}
          >
            ₹ {ledger.finalCashBalance.toLocaleString("en-IN")}
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
