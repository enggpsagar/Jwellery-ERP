import Link from "next/link"
import { CheckCircle2, ScanLine } from "lucide-react"

import { getOpenSessionSummary } from "@/lib/actions/scan-session-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/**
 * What the phone shows between scans.
 *
 * The camera lands here after each tag, so this is read at arm's length,
 * one-handed, for about two seconds: confirmation that the last one counted,
 * a running total, and nothing to press before scanning the next.
 */

export const dynamic = "force-dynamic"

type ScanPageProps = {
  searchParams?: Promise<{ added?: string; n?: string }>
}

export default async function ScanPage({ searchParams }: ScanPageProps) {
  const params = (await searchParams) ?? {}
  const summary = await getOpenSessionSummary()

  if (!summary) {
    return (
      <main className="mx-auto w-full max-w-lg p-4 sm:p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <ScanLine className="size-10 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">No scanning session open</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Start one from the New Invoice screen on your computer, then
                scan tags with this phone.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/billing">Go to billing</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  const justAdded = params.added

  return (
    <main className="mx-auto w-full max-w-lg space-y-4 p-4 sm:p-6">
      {justAdded ? (
        <Card className="border-[color-mix(in_oklab,var(--chart-3)_45%,transparent)]">
          <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
            <CheckCircle2 className="size-10 text-[var(--chart-3)]" />
            <p className="text-lg font-semibold">Added</p>
            <p className="font-mono text-sm text-muted-foreground">{justAdded}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Scan the next tag — no need to touch anything.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-5">
          <div className="flex items-baseline justify-between">
            <h1 className="text-base font-semibold">On this invoice</h1>
            <span className="text-sm text-muted-foreground">
              {summary.items.length}{" "}
              {summary.items.length === 1 ? "item" : "items"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {summary.storeName}
          </p>

          {summary.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing scanned yet. Point the camera at a tag.
            </p>
          ) : (
            <ul className="mt-4 divide-y">
              {summary.items.map((item, index) => (
                <li
                  key={`${item.stockCode}-${index}`}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {item.productName}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {item.stockCode}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            These are already on the invoice open on your computer. Finish the
            sale there.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
