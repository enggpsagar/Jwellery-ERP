import Link from "next/link"
import {
  ArrowRight,
  Boxes,
  Package,
  PackagePlus,
  Shapes,
  TriangleAlert,
} from "lucide-react"

import { getProducts } from "@/lib/actions/inventory/product-actions"
import { getInventoryStock } from "@/lib/actions/inventory/stock-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageBackHeader } from "@/components/shared/page-back-header"

/**
 * Tinted per measure from the validated chart palette, matching the dashboard
 * KPI row. The label carries the meaning, so the tint is decorative — and it
 * is the hue at low alpha with the hue as text, because several palette slots
 * fall under 3:1 as a flat fill on white.
 */
function StatTile({
  title,
  value,
  hint,
  icon: Icon,
  tint,
}: {
  title: string
  value: string | number
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  tint: string
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>

        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset"
          style={{
            backgroundColor: `color-mix(in oklab, ${tint} 12%, transparent)`,
            color: tint,
            // @ts-expect-error -- CSS custom property
            "--tw-ring-color": `color-mix(in oklab, ${tint} 22%, transparent)`,
          }}
        >
          <Icon className="size-[18px]" />
        </div>
      </CardContent>
    </Card>
  )
}

/** The two things you actually come to this page to open. */
function SectionCard({
  title,
  description,
  href,
  cta,
  meta,
  icon: Icon,
  tint,
}: {
  title: string
  description: string
  href: string
  cta: string
  meta: string
  icon: React.ComponentType<{ className?: string }>
  tint: string
}) {
  return (
    <Card className="group gap-0 py-0 transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset"
            style={{
              backgroundColor: `color-mix(in oklab, ${tint} 12%, transparent)`,
              color: tint,
              // @ts-expect-error -- CSS custom property
              "--tw-ring-color": `color-mix(in oklab, ${tint} 22%, transparent)`,
            }}
          >
            <Icon className="size-5" />
          </div>

          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            <p className="text-xs text-muted-foreground">{meta}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{description}</p>

        <Button asChild variant="outline" className="w-fit">
          <Link href={href}>
            {cta}
            <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export default async function InventoryDashboardPage() {
  // Dashboard summary needs the full unfiltered dataset to compute
  // accurate counts, unlike the list pages (which now paginate server-side)
  // — fetch with a very large pageSize to preserve the previous "fetch
  // everything" behaviour here specifically.
  const [{ products }, { stockItems }] = await Promise.all([
    getProducts({ pageSize: Number.MAX_SAFE_INTEGER }),
    getInventoryStock({ pageSize: Number.MAX_SAFE_INTEGER }),
  ])

  const activeProducts = products.filter((item) => item.isActive).length
  const totalStockItems = stockItems.length

  const inStock = stockItems.filter((item) => item.status === "IN_STOCK")
  const inStockQty = inStock.reduce((sum, item) => sum + item.quantity, 0)

  // A row can sit at IN_STOCK holding nothing — a stock entry opened from Add
  // Product defaults to a quantity of 0 — so it is worth surfacing rather
  // than letting it hide inside the headline count.
  const emptyRows = inStock.filter((item) => item.quantity <= 0).length
  const soldRows = stockItems.filter((item) => item.status === "SOLD").length

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Inventory"
        description="Manage jewellery products and actual stock pieces from one place."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          title="Active Products"
          value={activeProducts}
          hint={
            products.length !== activeProducts
              ? `${products.length - activeProducts} inactive`
              : "all products active"
          }
          icon={Shapes}
          tint="var(--chart-1)"
        />
        <StatTile
          title="Total Stock Entries"
          value={totalStockItems}
          hint={`${soldRows} sold out`}
          icon={Boxes}
          tint="var(--chart-4)"
        />
        <StatTile
          title="Current In-Stock Quantity"
          value={inStockQty}
          hint={`across ${inStock.length} entr${inStock.length === 1 ? "y" : "ies"}`}
          icon={Package}
          tint="var(--chart-3)"
        />
      </section>

      {emptyRows > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-amber-900 dark:text-amber-200">
            {emptyRows} stock {emptyRows === 1 ? "entry is" : "entries are"} marked
            In Stock but hold a quantity of 0.{" "}
            <Link href="/inventory/stock" className="font-medium underline">
              Review stock
            </Link>
          </p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Products"
          meta={`${activeProducts} active`}
          description="Product masters define the design and catalogue level of jewellery — metal, purity and the default charges every stock piece inherits."
          href="/inventory/products"
          cta="Manage Products"
          icon={Shapes}
          tint="var(--chart-1)"
        />

        <SectionCard
          title="Stock"
          meta={`${inStockQty} pieces on hand`}
          description="Stock entries are the physical items, each with its own weight, pricing and status. Selling one reduces its quantity rather than clearing the row."
          href="/inventory/stock"
          cta="Manage Stock"
          icon={PackagePlus}
          tint="var(--chart-3)"
        />
      </section>
    </main>
  )
}
