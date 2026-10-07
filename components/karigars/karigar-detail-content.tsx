import Link from "next/link"
import { PackageCheck } from "lucide-react"

import type { KarigarDetailBundle } from "@/lib/actions/karigar-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KarigarLedgerTabs } from "@/components/karigars/karigar-ledger-tabs"
import { KarigarStatusCard } from "@/components/karigars/karigar-status-card"
import { ExpandableCheckboxList } from "@/components/karigars/expandable-checkbox-list"
import { ExportMenu } from "@/components/shared/export-menu"
import { classifyMetalName } from "@/lib/business-units"
import { cn } from "@/lib/utils"
import { WeightText } from "@/components/shared/weight-text"

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
 * the Karigars list itself, so the two can never drift apart. The Open
 * Jobs card is the way into Receive Items for a job issued straight from
 * Issue Material — without it only a Draft Order's own button linked there,
 * so a directly issued job could never have its finished pieces received
 * as Products/Stock.
 */
export function KarigarDetailContent({
  bundle,
  hideStatusCard = false,
}: {
  bundle: KarigarDetailBundle
  /** Off inside the Karigars list's split-panel view, which shows the same
   * ArtisanActiveToggle inline next to Edit instead (see
   * karigar-detail-panel.tsx) rather than spending a grid card slot on it
   * there too. Defaults on for the standalone /karigars/[id] page, which
   * has no Edit button of its own to sit that toggle next to. */
  hideStatusCard?: boolean
}) {
  const { karigar, ledger, metals, openJobs } = bundle

  // Only what's actually set/nonzero — an unused Opening Gold/Cash field or
  // a karigar with no specialization recorded is clutter, not information.
  const hasOpeningGold = karigar.openingGold !== 0
  const hasOpeningCash = karigar.openingCash !== 0

  // Same Metals/Stones split as KarigarForm's own "Assigned Metals &
  // Stones" picker (isGemstone flag) — shown here read-only, checked
  // against assignedMetalTypeIds, so the detail view answers "which metals
  // or stones can this artisan be issued material in" at a glance instead
  // of only inside the edit form.
  const activeMetalsOnly = metals.filter((metal) => metal.isActive && !metal.isGemstone)
  const activeStonesOnly = metals.filter((metal) => metal.isActive && metal.isGemstone)

  return (
    <div className="space-y-6">
      {/* One grid, not two stacked ones — Opening Gold/Cash/Status and the
          live metal balance ribbons all need to read as a single row of
          at-a-glance cards, not visually split across a hard row break just
          because they used to be two separate <div>s. Specialization moved
          to the header's top-right corner (see KarigarDetailPanel/the
          standalone page's own header) instead of taking a card slot here. */}
      {/* items-start: a CSS grid item defaults to stretching to the tallest
          card in its row, which visibly bloated the compact metal-balance
          ribbon cards below to match Metal/Stone's taller checkbox lists.
          Each card now sizes to its own content instead. */}
      {/* auto-fit, not a fixed lg:grid-cols-5 — a karigar without an Opening
          Gold/Cash figure (or with the Status card hidden) only ever
          populates 2-3 of those 5 tracks, so a fixed column count reserved
          the other 1-2 as dead space and squeezed Metal/Stone's own track
          down to 1/5 width regardless — narrow enough that a plain word
          like "Diamond" or "Platinum" wrapped mid-letter inside
          ExpandableCheckboxList's break-words. auto-fit instead sizes
          however many cards actually render to fill the row. */}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          {hasOpeningGold && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Opening Gold</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">
                  <WeightText value={karigar.openingGold} suffix={false} />g
                </div>
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

        {!hideStatusCard && (
          <KarigarStatusCard karigarId={karigar.id} isActive={karigar.isActive} />
        )}

        {/* Single column, not col-span-2 -- that squeezed the metal-balance
            ribbon cards after it (e.g. "Yellow Gold Balance") down into too
            little width for their own large tabular-nums figure, which then
            overflowed the card's edge instead of wrapping. The checkbox
            list here already wraps safely at one column wide (see
            ExpandableCheckboxList's own min-w-0/break-words), so it doesn't
            need the extra room the ribbon cards actually do. */}
        {activeMetalsOnly.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Metal</CardTitle>
            </CardHeader>
            <CardContent>
              <ExpandableCheckboxList
                items={activeMetalsOnly}
                checkedIds={karigar.assignedMetalTypeIds}
              />
            </CardContent>
          </Card>
        )}

        {activeStonesOnly.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Stone</CardTitle>
            </CardHeader>
            <CardContent>
              <ExpandableCheckboxList
                items={activeStonesOnly}
                checkedIds={karigar.assignedMetalTypeIds}
              />
            </CardContent>
          </Card>
        )}

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
                className="px-3 py-2 text-[11px] font-semibold uppercase leading-tight"
                style={{
                  backgroundColor: `color-mix(in oklab, ${accent} 18%, transparent)`,
                  color: accent,
                }}
              >
                {group.metalLabel} Balance
              </div>
              <div className="p-3 pt-2.5">
                <p
                  className={cn(
                    "break-words text-lg font-bold tabular-nums",
                    isOwed ? "text-red-700" : isCredit ? "text-emerald-700" : "text-foreground",
                  )}
                >
                  <WeightText value={Math.abs(group.finalFineBalance)} suffix={false} />g
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

      {openJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Open Jobs ({openJobs.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {openJobs.map((job) => {
              const remaining = Math.max(0, job.issueWeight - job.receiveWeight)
              const purity = job.issuePurityLabel ?? job.issuePurity?.replace(/_/g, " ")
              return (
                <div
                  key={job.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="font-medium">
                      {job.jobNumber ?? "Job"}
                      {job.draftOrderNumber && (
                        <span className="font-normal text-muted-foreground"> · Draft Order {job.draftOrderNumber}</span>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {[job.metalName, purity].filter(Boolean).join(" ")} · Issued <WeightText value={job.issueWeight} suffix={false} />g on{" "}
                      {job.issueDate}
                      {job.expectedDate ? ` · Due ${job.expectedDate}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      Received <WeightText value={job.receiveWeight} suffix={false} />g ·{" "}
                      <span className="font-medium text-foreground">
                        <WeightText value={remaining} suffix={false} />g remaining
                      </span>
                    </p>
                  </div>
                  <Button asChild size="sm" className="shrink-0 gap-1.5">
                    <Link href={`/karigars/${karigar.id}/receive-items/${job.id}`}>
                      <PackageCheck className="h-4 w-4" />
                      Receive Items
                    </Link>
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
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
