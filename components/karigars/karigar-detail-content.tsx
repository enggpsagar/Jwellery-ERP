import type { KarigarDetailBundle } from "@/lib/actions/karigar-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KarigarLedgerTabs } from "@/components/karigars/karigar-ledger-tabs"
import { KarigarStatusCard } from "@/components/karigars/karigar-status-card"
import { ExportMenu } from "@/components/shared/export-menu"
import { classifyMetalName } from "@/lib/business-units"
import { cn } from "@/lib/utils"

/** A ribbon-colored accent per metal family, so Gold/Silver/Diamond balance
 *  cards are tellable apart at a glance without reading the label — GOLD
 *  reuses the app's own established gold hue (--chart-2, see globals.css);
 *  the others are reasonable, distinct proxies (cool grey for silver, blue
 *  for diamond) since there's no equivalent established token for them.
 *  Any other store-defined metal falls back to a neutral chart hue rather
 *  than guessing a color that might clash with what it actually is. */
function metalRibbonColor(metalLabel: string): string {
  switch (classifyMetalName(metalLabel)) {
    case "GOLD":
      return "var(--chart-2)"
    case "SILVER":
      return "#94a3b8"
    case "DIAMOND":
      return "var(--chart-1)"
    default:
      return "var(--chart-4)"
  }
}

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
      {/* One grid, not two stacked ones — Opening Gold/Cash/Specialization/
          Status and the live metal balance ribbons all need to read as a
          single row of at-a-glance cards, not visually split across a hard
          row break just because they used to be two separate <div>s. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

        <KarigarStatusCard karigarId={karigar.id} isActive={karigar.isActive} />

        {/* Live balances — ribbon-style: a full-width colored band per
            metal (so Gold vs Silver reads at a glance), carrying the label
            itself — a proper horizontal banner, not a thin accent line —
            with the weight made prominent below it, since that number is
            the thing anyone glancing at this card actually wants. */}
        {ledger.materialGroups.map((group) => {
          const isOwed = group.finalFineBalance > 0
          const isCredit = group.finalFineBalance < 0
          const accent = metalRibbonColor(group.metalLabel)

          return (
            <div
              key={group.metalTypeId ?? "unassigned"}
              className="overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <div
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: `color-mix(in oklab, ${accent} 18%, transparent)`,
                  color: accent,
                }}
              >
                {group.metalLabel} Balance
              </div>
              <div className="p-4 pt-3">
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    isOwed ? "text-red-700" : isCredit ? "text-emerald-700" : "text-foreground",
                  )}
                >
                  {Math.abs(group.finalFineBalance).toFixed(3)}g
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs font-medium",
                    isOwed ? "text-red-600" : isCredit ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  {isOwed ? "Artisan owes you" : isCredit ? "You owe the artisan" : "Settled"}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Opening Gold/Cash above are this karigar's starting point; this is
          the current running cash total from every ledger entry since. A
          single line, not a card — it's one number, and a box around it
          just eats space the metal cards above could use. Hidden entirely
          when settled (0) — nothing owed either way isn't worth a line on
          the page. */}
      {ledger.finalCashBalance !== 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Cash Balance (owed to artisan): </span>
          <span
            className={ledger.finalCashBalance > 0 ? "font-semibold text-red-700" : "font-semibold"}
          >
            ₹ {ledger.finalCashBalance.toLocaleString("en-IN")}
          </span>
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Artisan Ledger</CardTitle>
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
