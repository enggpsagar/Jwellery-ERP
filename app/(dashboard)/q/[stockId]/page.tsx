import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ScanLine, ShieldAlert } from "lucide-react"

import { verifyQuickSaleToken } from "@/lib/quick-sale-token"
import { getEffectiveStoreId } from "@/lib/store-context"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

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
  /** `t` is the scan token from /s; `x` is set when /s could not issue one. */
  searchParams: Promise<{ t?: string; x?: string }>
}

// A static title rather than the piece's stock code: reaching a specific
// entity here requires decoding the scan token and re-running the same
// permission/membership checks the page body performs (several of which can
// throw), which generateMetadata should never replicate. "Quick sale" is
// also what every branch of this page — denied, expired, not found, or the
// form itself — is actually showing.
export const metadata: Metadata = {
  title: "Quick Sale",
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

export default async function QuickSalePage({
  params,
  searchParams,
}: QuickSalePageProps) {
  const { stockId } = await params
  const { t: token, x: entryProblem } = await searchParams

  if (entryProblem === "denied") {
    return (
      <Notice
        icon={<ShieldAlert className="size-10 text-muted-foreground" />}
        title="Not your store"
        body="This tag belongs to a store you don't have access to. If that's wrong, ask the store owner to add you."
        action={{ href: "/dashboard", label: "Go to dashboard" }}
      />
    )
  }

  if (entryProblem === "missing") {
    return (
      <Notice
        icon={<ScanLine className="size-10 text-muted-foreground" />}
        title="Tag not recognised"
        body="Nothing matches this tag. The stock entry may have been removed, or the code may not be one of ours."
        action={{ href: "/inventory/stock", label: "Go to stock" }}
      />
    )
  }

  // Arrived without a token — opened by hand, or a stale link. Send it
  // through the entry point, which is the one place that resolves store
  // context, and come back with one.
  if (!token) {
    redirect(`/s/${stockId}`)
  }

  const verified = verifyQuickSaleToken(token)

  if (!verified.valid) {
    return (
      <Notice
        icon={<ScanLine className="size-10 text-muted-foreground" />}
        title={
          verified.reason === "expired" ? "This sale timed out" : "Link not valid"
        }
        body={
          verified.reason === "expired"
            ? "Sale links are short-lived for security. Scan the tag again to start a fresh one."
            : "This link could not be verified. Scan the tag again."
        }
        // Straight back to the entry point, which mints a new token. A link
        // rather than an automatic redirect, so an expired token cannot put
        // the page into a refresh cycle.
        action={{ href: `/s/${stockId}`, label: "Scan again" }}
      />
    )
  }

  // The token names the shop this sale belongs to. It is proof the scan was
  // authorised, not authority in itself — every call below re-checks the
  // session, the membership and the permission server-side.
  const { storeId } = verified.payload

  let target: QuickSaleTarget | null = null
  let customers: QuickSaleCustomer[] = []
  let notPermitted = false

  try {
    target = await getQuickSaleTarget(stockId, storeId)
  } catch {
    // requirePermission or the membership check threw: signed in, but not
    // allowed to sell here. Scanning a tag must not be a side door into
    // billing, nor into a store someone has been removed from.
    notPermitted = true
  }

  if (notPermitted) {
    return (
      <Notice
        icon={<ShieldAlert className="size-10 text-muted-foreground" />}
        title="Not available to you"
        body="You don't have permission to create invoices in this store. Ask the store owner if you need it."
        action={{ href: "/dashboard", label: "Go to dashboard" }}
      />
    )
  }

  // Reached without the store having been resolved — someone opened this path
  // directly, or followed an old link with a different store now active. Send
  // it through the entry point, which is the one place that decides store
  // context. `x` is absent by construction here, and /s always redirects back
  // with `x` set, so this cannot loop.
  // The token named a store and the piece is not in it — it was removed
  // between the scan and now. No redirect: /s would only mint another token
  // for the same missing row.
  if (!target) {
    return (
      <Notice
        icon={<ScanLine className="size-10 text-muted-foreground" />}
        title="Tag not recognised"
        body="Nothing matches this tag any more. The stock entry may have been removed."
        action={{ href: "/inventory/stock", label: "Go to stock" }}
      />
    )
  }

  // Same permission as above, so this cannot fail on its own.
  if (!target.blockedReason) {
    customers = await getQuickSaleCustomers(storeId)
  }

  // The stock page is scoped by the active-store cookie, while this page is
  // scoped by the token. For someone who belongs to several shops those can
  // point at different stores, and the link would then lead to a page that
  // cannot find the piece — so it is only a link when the two agree.
  const stockPageReachable = (await getEffectiveStoreId()) === storeId

  return (
    <main className="mx-auto w-full max-w-lg space-y-4 p-4 sm:p-6">
      {/* A scan arrives with no history behind it — the phone opened this URL
          cold, so there is nothing to go "back" to. The trail says where the
          piece sits and gives a way into the app from a standing start. */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/inventory/stock">Stock</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            {stockPageReachable ? (
              <BreadcrumbLink asChild>
                <Link href={`/inventory/stock/${target.stockId}`}>
                  {target.stockCode}
                </Link>
              </BreadcrumbLink>
            ) : (
              <span className="font-mono">{target.stockCode}</span>
            )}
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          <BreadcrumbItem>
            <BreadcrumbPage>Quick sale</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Quick sale</h1>
        <p className="text-sm text-muted-foreground">
          Pick the customer, enter the price, confirm — the invoice and stock
          entry are handled for you.
        </p>
      </div>

      <QuickSaleForm target={target} customers={customers} token={token} />
    </main>
  )
}
