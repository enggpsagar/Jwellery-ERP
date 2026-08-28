import Link from "next/link"
import { ScanLine, ShieldAlert } from "lucide-react"

import {
  getQuickSaleCustomers,
  getQuickSaleTarget,
  type QuickSaleCustomer,
  type QuickSaleTarget,
} from "@/lib/actions/quick-sale-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { QuickSaleForm } from "@/components/inventory/stock/quick-sale-form"

/**
 * Where a scanned stock QR lands.
 *
 * Short path on purpose — this string is encoded onto every printed tag, and
 * a shorter payload stays scannable when printed small on a jewellery label.
 *
 * The path carries only the stock id: an opaque cuid that names a row and
 * discloses nothing by itself. Reaching it still requires a session, and
 * everything it returns is store-scoped and permission-checked server-side,
 * so the printed tag is a pointer, never a credential.
 *
 * Reached from a phone camera, so it renders narrow and self-contained.
 */

type QuickSalePageProps = {
  params: Promise<{ stockId: string }>
}

/** Full-width message card, used for every dead end on this page. */
function Notice({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode
  title: string
  body: string
  action?: { href: string; label: string }
}) {
  return (
    <main className="mx-auto w-full max-w-lg p-4 sm:p-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {icon}

          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
          </div>

          {action ? (
            <Button asChild variant="outline" className="w-full">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}

export default async function QuickSalePage({ params }: QuickSalePageProps) {
  const { stockId } = await params

  let target: QuickSaleTarget | null = null
  let customers: QuickSaleCustomer[] = []

  try {
    target = await getQuickSaleTarget(stockId)
    // Only loaded once the tag resolves, so a scan of an unknown code does no
    // extra work — and only when a sale is actually possible.
    if (target && !target.blockedReason) {
      customers = await getQuickSaleCustomers()
    }
  } catch {
    // requirePermission threw: signed in, but not allowed to sell. Scanning a
    // tag must not become a side door into billing.
    return (
      <Notice
        icon={<ShieldAlert className="size-10 text-muted-foreground" />}
        title="Not available to you"
        body="You don't have permission to create invoices in this store. Ask the store owner if you need it."
        action={{ href: "/dashboard", label: "Go to dashboard" }}
      />
    )
  }

  // No match means the tag belongs to another store — most likely the person
  // scanning has a different store active, not that the piece is missing. The
  // message says so, because "not found" would send them hunting for the tag.
  if (!target) {
    return (
      <Notice
        icon={<ScanLine className="size-10 text-muted-foreground" />}
        title="Tag not in this store"
        body="This tag belongs to a different store, or the stock entry has been removed. Switch stores from the top bar and scan again."
        action={{ href: "/inventory/stock", label: "Go to stock" }}
      />
    )
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Quick sale</h1>
        <p className="text-sm text-muted-foreground">
          Pick the customer, enter the price, confirm — the invoice and stock
          entry are handled for you.
        </p>
      </div>

      <QuickSaleForm target={target} customers={customers} />
    </main>
  )
}
