"use client"

import { Gem } from "lucide-react"

import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"
import { cn } from "@/lib/utils"

/**
 * "Does this piece have a stone?" — asked first, as one clear yes/no
 * toggle, wherever a piece is entered by hand: a new sale line (top of its
 * New product details) and every old-gold line in an Old Gold Exchange.
 * Turning it on reveals the stone's own fields (StoneComponentFields) right
 * underneath, so the metal's net weight and the stone's value are entered
 * together. Wraps IncludesStoneToggle so the switch itself looks the same as
 * on every product/stock form.
 */
export function StonePresenceQuestion({
  checked,
  onChange,
  hint = "Diamond, ruby, emerald or any other gem set in the metal",
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  className?: string
}) {
  return (
    // The whole row is the tap target (a counter tablet), not just the switch.
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
        "flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "border-emerald-400 bg-emerald-50" : "border-border bg-muted/40 hover:bg-muted/70",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            checked ? "bg-emerald-500 text-white" : "bg-background text-muted-foreground",
          )}
        >
          <Gem className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Does this piece have a stone?</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {/* The switch handles its own click; keep it from also toggling the row. */}
      <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <IncludesStoneToggle checked={checked} onChange={onChange} label={checked ? "Yes" : "No"} />
      </span>
    </div>
  )
}
