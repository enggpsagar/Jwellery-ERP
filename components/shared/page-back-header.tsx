import Link from "next/link"
import { ArrowLeft } from "lucide-react"

type PageBackHeaderProps = {
  title: string
  description?: string
  backHref: string
  backLabel?: string
  action?: React.ReactNode
}

export function PageBackHeader({
  title,
  description,
  backHref,
  backLabel = "Back",
  action,
}: PageBackHeaderProps) {
  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {/* min-w-0 so the action slot (often a row of buttons with
            shrink-0) is forced to respect the available width and wrap
            instead of pushing the page wider than the viewport — a plain
            flex child's default min-width is its content size, not 0. */}
        {action ? <div className="min-w-0">{action}</div> : null}
      </div>
    </div>
  )
}