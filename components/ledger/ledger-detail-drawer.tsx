"use client"

import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react"

import type { LedgerEntry } from "@/lib/data"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"

function formatGrams(value: number) {
  return `${value.toLocaleString("en-IN", { minimumFractionDigits: value % 1 === 0 ? 0 : 1, maximumFractionDigits: 3 })} g`
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right tabular-nums">{value}</span>
    </div>
  )
}

export function LedgerDetailDrawer({
  entry,
  open,
  onOpenChange,
}: {
  entry: LedgerEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {entry ? (
          <>
            <SheetHeader className="gap-1 border-b p-6">
              <div className="flex items-center justify-between gap-3">
                <SheetTitle className="text-lg">Transaction Details</SheetTitle>
                <Badge
                  variant="outline"
                  className="font-mono text-xs font-normal"
                >
                  {entry.id}
                </Badge>
              </div>
              <SheetDescription>
                Recorded on {entry.date} · Ref {entry.reference}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-6 p-6">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11">
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      {entry.customerInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium">{entry.customer}</span>
                    <span className="text-sm text-muted-foreground">
                      {entry.metal} account · {entry.purity}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ArrowDownLeft className="size-3.5 text-emerald-600" />
                      Weight In
                    </div>
                    <span className="text-lg font-semibold tabular-nums">
                      {entry.weightIn > 0 ? formatGrams(entry.weightIn) : "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ArrowUpRight className="size-3.5 text-destructive" />
                      Weight Out
                    </div>
                    <span className="text-lg font-semibold tabular-nums">
                      {entry.weightOut > 0 ? formatGrams(entry.weightOut) : "—"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Scale className="size-4" />
                    </div>
                    <span className="text-sm font-medium">Net Balance</span>
                  </div>
                  <span
                    className={
                      entry.balance >= 0
                        ? "text-lg font-semibold tabular-nums text-emerald-600"
                        : "text-lg font-semibold tabular-nums text-destructive"
                    }
                  >
                    {entry.balance >= 0 ? "+" : ""}
                    {formatGrams(entry.balance)}
                  </span>
                </div>

                <div>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Information
                  </h3>
                  <DetailRow label="Transaction Type" value={entry.type} />
                  <Separator />
                  <DetailRow
                    label="Metal"
                    value={`${entry.metal} (${entry.purity})`}
                  />
                  <Separator />
                  <DetailRow label="Rate Applied" value={entry.rate} />
                  <Separator />
                  <DetailRow
                    label="Reference"
                    value={
                      <span className="font-mono text-xs">{entry.reference}</span>
                    }
                  />
                  <Separator />
                  <DetailRow label="Date" value={entry.date} />
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes
                  </h3>
                  <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
                    {entry.notes}
                  </p>
                </div>
              </div>
            </ScrollArea>

            <div className="flex items-center gap-3 border-t p-4">
              <Button variant="outline" className="flex-1">
                Print Voucher
              </Button>
              <Button className="flex-1">Edit Entry</Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
