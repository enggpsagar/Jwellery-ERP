import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import {
  getStorePlanHistory,
  getStorePlanOverview,
} from "@/lib/actions/store-plan-actions"
import { Button } from "@/components/ui/button"
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
import { StoreReminderChannels } from "@/components/stores/store-reminder-channels"

/**
 * One store's subscription record in full: where it stands now, and every
 * plan period it has ever been on.
 *
 * Super Admin only, enforced in the query layer (requireRole) as well as by
 * the middleware rule on /stores — this page is one reader of that data, not
 * the thing that guards it.
 */

type StoreDetailPageProps = {
  params: Promise<{ id: string }>
}

const getStoreOverview = cache(getStorePlanOverview)

export async function generateMetadata({
  params,
}: StoreDetailPageProps): Promise<Metadata> {
  try {
    const { id } = await params
    const overview = await getStoreOverview(id)
    return { title: overview?.name ?? "Store" }
  } catch {
    return { title: "Store" }
  }
}

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

export default async function StoreDetailPage({ params }: StoreDetailPageProps) {
  const { id } = await params

  const [overview, history] = await Promise.all([
    getStoreOverview(id),
    getStorePlanHistory(id),
  ])

  if (!overview) notFound()

  const daysRemaining = overview.daysRemaining

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-3">
        <Link
          href="/stores"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Stores
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {overview.name}
              </h1>
              <PlanStatusPill status={overview.status} />
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              {overview.code}
            </p>
          </div>

          <Button asChild variant="outline" className="gap-2">
            <Link href={`/stores/${overview.storeId}/edit`}>
              <Pencil className="size-4" />
              Edit store
            </Link>
          </Button>
        </div>
      </div>

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
    </main>
  )
}
