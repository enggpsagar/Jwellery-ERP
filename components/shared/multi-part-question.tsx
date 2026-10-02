"use client"

import { Layers } from "lucide-react"

import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"
import { cn } from "@/lib/utils"

/**
 * "Made of more than one metal or stone?" — asked on a new sale line (top
 * of New product details), a purchase line and an item bought from a
 * customer. On → the piece's metals and stones are entered row by row
 * (PieceComponentsEditor), each with its own rate (and GST on a sale/
 * purchase). Same whole-row tap target as StonePresenceQuestion.
 */
export function MultiPartQuestion({
  checked,
  onChange,
  hint = "e.g. gold + silver + diamond in one piece — each priced and taxed on its own",
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault()
          onChange(!checked)
        }
      }}
      className={cn(
        "flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "border-amber-400 bg-amber-50" : "border-border bg-muted/40 hover:bg-muted/70",
      )}
      data-testid="multi-part-question"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            checked ? "bg-amber-500 text-white" : "bg-background text-muted-foreground",
          )}
        >
          <Layers className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Made of more than one metal or stone?</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <IncludesStoneToggle checked={checked} onChange={onChange} label={checked ? "Yes" : "No"} />
      </span>
    </div>
  )
}
