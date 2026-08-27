import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * The shared shape for a record's detail page.
 *
 * Customer and Vendor each grew their own version of this — a bare <h2>, a
 * grid of hand-rolled bordered boxes, a second grid below with different
 * spacing — which is why those pages read as a different product from the
 * rest of the app. One component means adding a field is a one-line change
 * and every detail page keeps agreeing on rhythm.
 */
export function DetailSection({
  title,
  description,
  icon: Icon,
  tint,
  action,
  children,
}: {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  /** A chart-palette hue, so section marks match the KPI tiles and charts. */
  tint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b py-5">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && tint ? (
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
          ) : null}

          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        {action}
      </CardHeader>

      <CardContent className="p-6">{children}</CardContent>
    </Card>
  )
}

/** A grid of fields. Defaults to three columns, the density these pages want. */
export function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  )
}

/**
 * One label/value pair.
 *
 * Deliberately not a bordered box: a page of twelve outlined tiles reads as
 * twelve competing objects. The label carries the structure and the value
 * carries the weight, which is what makes a dense record scannable.
 */
export function DetailField({
  label,
  value,
  span,
}: {
  label: string
  value?: React.ReactNode
  /** Full width, for addresses and notes that need the room. */
  span?: boolean
}) {
  const empty =
    value === undefined || value === null || value === "" || value === "-"

  return (
    <div className={span ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div
        className={
          empty
            ? "mt-1 text-sm text-muted-foreground"
            : "mt-1 text-sm font-medium break-words"
        }
      >
        {empty ? "—" : value}
      </div>
    </div>
  )
}
