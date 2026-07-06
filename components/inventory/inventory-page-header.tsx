// components/inventory/inventory-page-header.tsx

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

type InventoryPageHeaderProps = {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
}

export function InventoryPageHeader({
  title,
  description,
  backHref = "/inventory",
  backLabel = "Back",
  actions,
}: InventoryPageHeaderProps) {
  return (
    <div className="space-y-4">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {actions ? <div>{actions}</div> : null}
      </div>
    </div>
  )
}