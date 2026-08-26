"use client"

import { Fragment, useMemo, useState } from "react"

import type { MetalDailyLedgerResult } from "@/lib/actions/ledger-actions"
import { formatUnitValue, WEIGHT_BASED_UNITS } from "@/lib/business-units"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ExportMenu } from "@/components/shared/export-menu"

function daysAgo(dateISO: string) {
  return Math.floor((Date.now() - new Date(dateISO).getTime()) / (1000 * 60 * 60 * 24))
}

const dateRanges = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
]

type MetalDailyLedgerProps = {
  data: MetalDailyLedgerResult
}

export function MetalDailyLedger({ data }: MetalDailyLedgerProps) {
  const [dateRange, setDateRange] = useState("30d")

  const rows = useMemo(() => {
    if (dateRange === "all") return data.rows
    const maxDays = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90
    return data.rows.filter((row) => daysAgo(row.dateISO) <= maxDays)
  }, [data.rows, dateRange])

  if (data.activeUnits.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          This store isn&apos;t configured for any metal business units yet — add Gold,
          Silver, or Diamond in Settings → Business Units to see a metal-wise ledger.
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
              Purchased, sold, and running closing balance per metal, by day.
            </CardDescription>
          </div>
          <ExportMenu href="/ledger/export?scope=metal-wise" label="Export" />
        </div>

        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {dateRanges.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6">Date</TableHead>
              {data.activeUnits.map((unit) => (
                <TableHead key={unit} colSpan={3} className="text-center border-l">
                  {unit === "GOLD" ? "Gold" : unit === "SILVER" ? "Silver" : "Diamond"}
                </TableHead>
              ))}
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6" />
              {data.activeUnits.map((unit) => (
                <Fragment key={unit}>
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
                    const entry = row.units.find((u) => u.unit === unit)
                    const weightBased = WEIGHT_BASED_UNITS.includes(unit)

                    return (
                      <Fragment key={unit}>
                        <TableCell className="border-l text-right tabular-nums">
                          {entry && entry.purchasedValue > 0 ? (
                            <span className="text-emerald-600">
                              {formatUnitValue(unit, entry.purchasedValue)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {entry && entry.soldValue > 0 ? (
                            <span className="text-destructive">
                              {formatUnitValue(unit, entry.soldValue)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {entry ? (
                            weightBased && entry.closingBalance < 0 ? (
                              <span className="text-destructive">
                                -{formatUnitValue(unit, entry.closingBalance)}
                              </span>
                            ) : (
                              formatUnitValue(unit, entry.closingBalance)
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
