"use client"

import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ExportMenuProps = {
  /** Export route to hit, e.g. "/ledger/export?scope=metal-wise" — a "&format=csv|excel" is appended. */
  href: string
  label?: string
  /** Render just the Download icon (no visible label) — the trigger keeps its accessible name via title/aria-label. */
  iconOnly?: boolean
}

/** Reusable "Export ▾ CSV / Excel" trigger — opens the export route in a new tab, mirroring the working download pattern in metal-rates-table.tsx. */
export function ExportMenu({ href, label = "Export", iconOnly = false }: ExportMenuProps) {
  const separator = href.includes("?") ? "&" : "?"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {iconOnly ? (
          <Button
            size="icon-sm"
            title={label}
            aria-label={label}
            className="bg-[var(--chart-1)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-1)_88%,black)]"
          >
            <Download />
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-[var(--chart-1)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-1)_88%,black)]"
          >
            <Download data-icon="inline-start" />
            {label}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => window.open(`${href}${separator}format=csv`, "_blank")}
        >
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open(`${href}${separator}format=excel`, "_blank")}
        >
          Export as Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
