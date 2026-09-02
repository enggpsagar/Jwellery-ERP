"use client"

import Link from "next/link"
import { ArrowDownLeft, ArrowUpRight, Wallet, Receipt } from "lucide-react"

import type { LedgerEntryRow } from "@/lib/actions/ledger-actions"
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

function formatCurrency(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
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
  entry: LedgerEntryRow | null
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
                  {entry.id.slice(0, 10)}
                </Badge>
              </div>
              <SheetDescription>
                Recorded on {entry.date} · {entry.sourceLabel}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-6 p-6">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11">
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      {entry.accountInitials || "—"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    {entry.accountHref ? (
                      <Link href={entry.accountHref} className="font-medium hover:underline">
                        {entry.account}
                      </Link>
                    ) : (
                      <span className="font-medium">{entry.account}</span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {entry.sourceLabel}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Wallet className="size-4" />
                    </div>
                    <span className="text-sm font-medium">
                      {entry.type === "CREDIT" ? "Credit" : "Debit"}
                    </span>
                  </div>
                  <span
                    className={
                      entry.type === "CREDIT"
                        ? "flex items-center gap-1 text-lg font-semibold tabular-nums text-emerald-600"
                        : "flex items-center gap-1 text-lg font-semibold tabular-nums text-destructive"
                    }
                  >
                    {entry.type === "CREDIT" ? (
                      <ArrowDownLeft className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                    {formatCurrency(entry.amount)}
                  </span>
                </div>

                {entry.metalWeight ? (
                  <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                    <span className="text-sm text-muted-foreground">Metal Weight</span>
                    <span className="text-sm font-medium tabular-nums">
                      {entry.metalWeight.toLocaleString("en-IN", { maximumFractionDigits: 3 })} g
                      {entry.metalType ? ` (${entry.metalType})` : ""}
                    </span>
                  </div>
                ) : null}

                {entry.caratWeight ? (
                  <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                    <span className="text-sm text-muted-foreground">Carat Weight</span>
                    <span className="text-sm font-medium tabular-nums">
                      {entry.caratWeight.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ct
                      {entry.metalType ? ` (${entry.metalType})` : ""}
                    </span>
                  </div>
                ) : null}

                <div>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Information
                  </h3>
                  <DetailRow label="Type" value={entry.sourceLabel} />
                  {entry.paymentMethod ? (
                    <>
                      <Separator />
                      <DetailRow
                        label="Payment Method"
                        value={PAYMENT_METHOD_LABELS[entry.paymentMethod] ?? entry.paymentMethod}
                      />
                    </>
                  ) : null}
                  <Separator />
                  <DetailRow
                    label="Invoice"
                    value={
                      entry.invoiceId && entry.invoiceNumber ? (
                        <Link
                          href={`/billing/${entry.invoiceId}`}
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <Receipt className="size-3.5" />
                          {entry.invoiceNumber}
                        </Link>
                      ) : (
                        "—"
                      )
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
                    {entry.description || "No notes for this entry."}
                  </p>
                </div>
              </div>
            </ScrollArea>

            <div className="flex items-center gap-3 border-t p-4">
              {entry.invoiceId ? (
                <Link href={`/billing/${entry.invoiceId}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    View Invoice
                  </Button>
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
