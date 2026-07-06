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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {action ? <div>{action}</div> : null}
      </div>
    </div>
  )
}