import { CreditCard } from "lucide-react"

import { getOwnStorePlan } from "@/lib/actions/store-plan-actions"
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
  PlanStatusPill,
  formatDay,
  formatMoney,
} from "@/components/stores/plan-presentation"
import { RenewalContactDialog } from "@/components/stores/renewal-contact-dialog"

/**
 * A store owner's own plan and payment history.
 *
 * The same ledger the Super Admin sees for this shop, scoped to the shop the
 * owner is signed in to — someone paying for the software should be able to
 * see what they are paying for, when it renews, and what they have been
 * billed, without having to ask.
 *
 * Renewals stay a Super Admin action, so this page reads rather than acts.
 */

export const dynamic = "force-dynamic"

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

export default async function MyPlanPage() {
  const data = await getOwnStorePlan()

  if (!data) {
    return (
      <main className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <CreditCard className="size-10 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">No plan information</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                We couldn&apos;t find plan details for your store.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }

  const { overview, history } = data
  const { daysRemaining } = overview

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Plan &amp; Billing
            </h1>
            <PlanStatusPill status={overview.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {overview.name} · <span className="font-mono">{overview.code}</span>
          </p>
        </div>

        {/* Renewals are handled by the platform, so the useful action here is
            getting in touch rather than a button that cannot do anything. */}
        <RenewalContactDialog />
      </div>

      {overview.status === "EXPIRED" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Your plan expired on {formatDay(overview.planExpiresAt)}. Get in touch
          to renew and keep your shop running.
        </div>
      ) : null}

      {overview.status === "EXPIRING_SOON" && daysRemaining !== null ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your plan renews in {daysRemaining}{" "}
          {daysRemaining === 1 ? "day" : "days"}, on{" "}
          {formatDay(overview.planExpiresAt)}.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          label="Renews on"
          value={formatDay(overview.nextRenewalDue)}
          hint={
            daysRemaining !== null
              ? daysRemaining > 0
                ? `${daysRemaining} days remaining`
                : `Overdue by ${Math.abs(daysRemaining)} days`
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
          label="Total billed"
          value={formatMoney(overview.totalBilled)}
          hint={`${overview.periodsCount} plan ${
            overview.periodsCount === 1 ? "period" : "periods"
          }`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment &amp; plan history</CardTitle>
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
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No plan history recorded yet.
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
