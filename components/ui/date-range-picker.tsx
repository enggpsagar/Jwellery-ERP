"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn, formatShortDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type DateRangeValue = {
  /** "YYYY-MM-DD", or "" when unset — matches the dateFrom/dateTo URL
   * search-param format every caller already reads/writes. */
  from: string
  to: string
}

type DateRangePickerProps = {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

/** "YYYY-MM-DD" (as stored in the dateFrom/dateTo URL params) <-> Date,
 * parsed as a local calendar date rather than through `new Date(string)`
 * (which reads a bare "YYYY-MM-DD" as UTC midnight and can render as the
 * previous day in a timezone west of UTC). */
function fromIso(value: string): Date | undefined {
  if (!value) return undefined
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return undefined
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function toIso(date: Date | undefined): string {
  if (!date) return ""
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Single bordered combo-box date-range input (one calendar icon, one
 * popover) replacing the old pair of native `type="date"` from/to inputs
 * previously duplicated in every list-page toolbar. Picking a start and end
 * date is one interaction inside the popover; the value in/out is still the
 * plain "YYYY-MM-DD" pair every caller's URL params and server actions
 * already expect, so no caller-side filtering logic changes.
 */
export function DateRangePicker({ value, onChange, placeholder = "Date range", disabled, className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  const range: DateRange | undefined = React.useMemo(() => {
    const from = fromIso(value.from)
    const to = fromIso(value.to)
    if (!from && !to) return undefined
    return { from, to }
  }, [value.from, value.to])

  const label = range?.from
    ? range.to
      ? `${formatShortDate(range.from)} - ${formatShortDate(range.to)}`
      : formatShortDate(range.from)
    : placeholder

  const handleSelect = (next: DateRange | undefined) => {
    onChange({ from: toIso(next?.from), to: toIso(next?.to) })
    // Close only once both ends are picked — the first click (from only)
    // should keep the popover open so the second click can land.
    if (next?.from && next?.to) {
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 min-w-0 justify-between gap-2 border-input px-2.5 text-sm font-normal",
            !range?.from && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{label}</span>
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto gap-0 p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          defaultMonth={range?.from}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
