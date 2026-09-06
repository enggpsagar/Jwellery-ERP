"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"

import {
  QUICK_RANGE_OPTIONS,
  matchQuickRange,
  getQuickRange,
  matchFinancialYear,
  getFinancialYearRange,
  financialYearLabel,
  type QuickRangeKey,
} from "@/lib/date-range"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ReportDateFilterProps = {
  /** False when the active report tab is a point-in-time snapshot (current
   * stock valuation, open karigar jobs, current customer dues) rather than
   * a period — the range wouldn't change anything for it, so the controls
   * are disabled rather than left silently inert. */
  applies: boolean
  /** Financial years (start year, Apr-Mar) that actually have data behind
   * them — see getAvailableFinancialYears(). The FY dropdown only offers
   * these, and is omitted entirely when this is empty. */
  financialYears: number[]
}

export function ReportDateFilter({ applies, financialYears }: ReportDateFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const from = searchParams.get("from") ?? ""
  const to = searchParams.get("to") ?? ""
  const activePreset = from && to ? matchQuickRange(from, to) : undefined
  const activeFinancialYear = from && to ? matchFinancialYear(from, to) : undefined

  function setRange(next: { from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.from) params.set("from", next.from)
    else params.delete("from")
    if (next.to) params.set("to", next.to)
    else params.delete("to")
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function applyPreset(key: QuickRangeKey) {
    setRange(getQuickRange(key))
  }

  function applyFinancialYear(value: string) {
    setRange(getFinancialYearRange(Number(value)))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_RANGE_OPTIONS.map((option) => (
          <Button
            key={option.key}
            type="button"
            size="sm"
            variant={activePreset === option.key ? "default" : "outline"}
            disabled={!applies}
            onClick={() => applyPreset(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="mx-1 h-6 w-px bg-border" />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From
          <Input
            type="date"
            className="h-8 w-36"
            value={from}
            disabled={!applies}
            max={to || undefined}
            onChange={(e) => setRange({ from: e.target.value, to })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          To
          <Input
            type="date"
            className="h-8 w-36"
            value={to}
            disabled={!applies}
            min={from || undefined}
            onChange={(e) => setRange({ from, to: e.target.value })}
          />
        </label>
        {(from || to) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!applies}
            onClick={() => setRange({})}
          >
            Clear
          </Button>
        )}
      </div>

      {financialYears.length > 0 && (
        <>
          <div className="mx-1 h-6 w-px bg-border" />
          <Select
            value={activeFinancialYear !== undefined ? String(activeFinancialYear) : ""}
            onValueChange={applyFinancialYear}
            disabled={!applies}
          >
            <SelectTrigger size="sm" className="h-8 w-36">
              <SelectValue placeholder="Financial year" />
            </SelectTrigger>
            <SelectContent>
              {financialYears.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {financialYearLabel(year)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {!applies && (
        <p className="text-xs text-muted-foreground">
          This report always shows current, all-time data — date range doesn&apos;t apply here.
        </p>
      )}
    </div>
  )
}
