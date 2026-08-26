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
}

/** Reusable "Export ▾ CSV / Excel" trigger — opens the export route in a new tab, mirroring the working download pattern in metal-rates-table.tsx. */
export function ExportMenu({ href, label = "Export" }: ExportMenuProps) {
  const separator = href.includes("?") ? "&" : "?"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download data-icon="inline-start" />
          {label}
        </Button>
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
