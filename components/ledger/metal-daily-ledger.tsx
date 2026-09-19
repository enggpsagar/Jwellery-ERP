"use client"

import { Fragment, useMemo, useState } from "react"

import type { MetalDailyLedgerResult } from "@/lib/actions/ledger-actions"
import { formatUnitValue } from "@/lib/business-units"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ExportMenu } from "@/components/shared/export-menu"
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker"

/** "YYYY-MM-DD" -> local-midnight epoch ms, so a row's date and a range
 * bound compare on the same calendar day regardless of timezone. */
function parseLocalDate(value: string): number | null {
  if (!value) return null
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).getTime()
}

type MetalDailyLedgerProps = {
  data: MetalDailyLedgerResult
}

export function MetalDailyLedger({ data }: MetalDailyLedgerProps) {
  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: "", to: "" })

  const rows = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return data.rows
    const fromTime = parseLocalDate(dateRange.from)
    const toTime = parseLocalDate(dateRange.to)
    return data.rows.filter((row) => {
      const rowTime = parseLocalDate(row.dateISO)
      if (rowTime == null) return true
      if (fromTime != null && rowTime < fromTime) return false
      if (toTime != null && rowTime > toTime) return false
      return true
    })
  }, [data.rows, dateRange])

  if (data.activeUnits.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          This store isn&apos;t configured for any metal/stone business units yet —
          add a metal or stone in Settings → Business Model to see a metal-wise ledger.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="gap-4 border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>Metal-wise Daily Ledger</CardTitle>
            <CardDescription>
              Purchased, sold, and running closing balance per unit, by day.
            </CardDescription>
          </div>
          <ExportMenu href="/ledger/export?scope=metal-wise" label="Export" iconOnly />
        </div>

        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          placeholder="Date range"
          className="w-[220px]"
        />
      </CardHeader>

      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6">Date</TableHead>
              {data.activeUnits.map((unit) => (
                <TableHead key={unit.value} colSpan={3} className="text-center border-l">
                  {unit.label}
                </TableHead>
              ))}
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6" />
              {data.activeUnits.map((unit) => (
                <Fragment key={unit.value}>
                  <TableHead className="border-l text-right text-xs">Purchased</TableHead>
                  <TableHead className="text-right text-xs">Sold</TableHead>
                  <TableHead className="text-right text-xs">Closing</TableHead>
                </Fragment>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={1 + data.activeUnits.length * 3}
                  className="h-32 text-center text-muted-foreground"
                >
                  No metal purchase/sale activity in this range.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.dateISO}>
                  <TableCell className="pl-6 whitespace-nowrap text-sm text-muted-foreground">
                    {row.date}
                  </TableCell>
                  {data.activeUnits.map((unit) => {
                    const entry = row.units.find((u) => u.unit === unit.value)
                    const hint = { value: unit.value, isGemstone: unit.isGemstone }

                    return (
                      <Fragment key={unit.value}>
                        <TableCell className="border-l text-right tabular-nums">
                          {entry && entry.purchasedValue > 0 ? (
                            <span className="text-emerald-600">
                              {formatUnitValue(hint, entry.purchasedValue)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {entry && entry.soldValue > 0 ? (
                            <span className="text-destructive">
                              {formatUnitValue(hint, entry.soldValue)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {entry ? (
                            entry.closingBalance < 0 ? (
                              <span className="text-destructive">
                                -{formatUnitValue(hint, entry.closingBalance)}
                              </span>
                            ) : (
                              formatUnitValue(hint, entry.closingBalance)
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </Fragment>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
