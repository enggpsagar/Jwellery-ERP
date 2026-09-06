import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  PLAN_ACTION_LABEL,
  formatDay,
  formatMoney,
} from "@/components/stores/plan-presentation"
import { StoreReminderChannels } from "@/components/stores/store-reminder-channels"
import type { StorePlanOverview, PlanHistoryRow } from "@/lib/actions/store-plan-actions"

/** One labelled figure in the summary grid. */
function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * The body of a store's subscription record — renewal/billing stats and
 * the full plan history. Shared between the standalone /stores/[id] page
 * and the inline detail pane on the Stores list itself, so the two can
 * never drift apart.
 */
export function StoreDetailContent({
  overview,
  history,
}: {
  overview: StorePlanOverview
  history: PlanHistoryRow[]
}) {
  const daysRemaining = overview.daysRemaining

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registered" value={formatDay(overview.registeredAt)} />
        <Stat
          label="Current plan"
          value={overview.planName ?? "No plan"}
          hint={
            overview.planStartedAt
              ? `Activated ${formatDay(overview.planStartedAt)}`
              : undefined
          }
        />
        <Stat
          label="Last renewal"
          value={
            overview.lastRenewedAt
              ? formatDay(overview.lastRenewedAt)
              : "Never renewed"
          }
        />
        <Stat
          label="Next renewal due"
          value={formatDay(overview.nextRenewalDue)}
          hint={
            daysRemaining !== null
              ? daysRemaining > 0
                ? `${daysRemaining} days remaining`
                : `Overdue by ${Math.abs(daysRemaining)} days`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Renewal reminders</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Last reminder sent</p>
              <p className="mt-0.5 text-sm font-medium">
                {overview.reminderSentAt
                  ? formatDay(overview.reminderSentAt)
                  : "Not sent for this period"}
              </p>
            </div>

            <StoreReminderChannels
              storeId={overview.storeId}
              emailEnabled={overview.reminderEmailEnabled}
              whatsappEnabled={overview.reminderWhatsappEnabled}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Billing to date</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Stat label="Total billed" value={formatMoney(overview.totalBilled)} />
            <Stat label="Plan periods" value={overview.periodsCount} />
            <Stat
              label="Store"
              value={overview.isActive ? "Active" : "Archived"}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Plan and subscription history
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No plan history recorded for this store yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {row.planName}
                          {row.isCurrent ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-700"
                            >
                              Current
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {PLAN_ACTION_LABEL[row.action] ?? row.action}
                      </TableCell>
                      <TableCell>{formatDay(row.startedAt)}</TableCell>
                      <TableCell>{formatDay(row.expiresAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.durationDays}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.price)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.actorName ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.note ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
