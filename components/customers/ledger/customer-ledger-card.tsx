// components/customers/ledger/customer-ledger-card.tsx
import Link from "next/link"
import { Receipt } from "lucide-react"

import {
  getCustomerLedgerEntries,
  getCustomerLedgerSummary,
} from "@/lib/actions/customer-ledger-actions"
import { classifyMetalName } from "@/lib/business-units"
import { getActiveBusinessUnits } from "@/lib/business-units.server"
import { AddCustomerSaleEntryDialog } from "@/components/customers/ledger/add-customer-sale-entry-dialog"
import { AddCustomerRefundEntryDialog } from "@/components/customers/ledger/add-customer-refund-entry-dialog"
import { EmailLedgerStatementButton } from "@/components/customers/ledger/email-ledger-statement-button"

type CustomerLedgerCardProps = {
  customerId: string
}

function formatAmount(value: number) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatWeight(value: number) {
  return `${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} g`
}

function formatCarat(value: number) {
  return `${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} ct`
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

function formatEntryAmount(entry: {
  metalType: string | null
  metalWeight: number | null
  caratWeight: number | null
  amount: number
}) {
  const family = classifyMetalName(entry.metalType)

  if ((family === "GOLD" || family === "SILVER") && entry.metalWeight != null) {
    return formatWeight(entry.metalWeight)
  }

  if (family === "DIAMOND" && entry.caratWeight != null) {
    return formatCarat(entry.caratWeight)
  }

  return formatAmount(entry.amount)
}

export async function CustomerLedgerCard({
  customerId,
}: CustomerLedgerCardProps) {
  const [entries, summary, activeUnits] = await Promise.all([
    getCustomerLedgerEntries(customerId),
    getCustomerLedgerSummary(customerId),
    getActiveBusinessUnits(),
  ])

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Customer Ledger
          </h2>
          <p className="text-sm text-muted-foreground">
            Add sale and refund/payment entries for this customer.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <EmailLedgerStatementButton customerId={customerId} />
          <AddCustomerSaleEntryDialog
            customerId={customerId}
            activeUnits={activeUnits}
          />
          <AddCustomerRefundEntryDialog
            customerId={customerId}
            activeUnits={activeUnits}
          />
        </div>
      </div>

      {summary && (
        <div className="space-y-4">
          {summary.moneyActive && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Opening Balance
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(summary.openingBalance)}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total Sales (Debit)
                </p>
                <p className="mt-1 text-sm font-semibold text-red-600">
                  {formatAmount(summary.ledgerDebitTotal)}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total Refund / Received (Credit)
                </p>
                <p className="mt-1 text-sm font-semibold text-green-600">
                  {formatAmount(summary.ledgerCreditTotal)}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current Ledger Balance
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(summary.currentBalance)}
                </p>
              </div>
            </div>
          )}

          {summary.unitSummaries.map((unit) => {
            const format = unit.isGemstone ? formatCarat : formatWeight

            return (
              <div key={unit.unit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {unit.label} Debit
                  </p>
                  <p className="mt-1 text-sm font-semibold text-red-600">
                    {format(unit.debitTotal)}
                  </p>
                </div>

                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {unit.label} Credit
                  </p>
                  <p className="mt-1 text-sm font-semibold text-green-600">
                    {format(unit.creditTotal)}
                  </p>
                </div>

                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {unit.label} Balance
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {format(unit.currentBalance)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-4">
          <h3 className="text-sm font-semibold text-foreground">Ledger History</h3>
        </div>

        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No ledger entries found for this customer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Entry Type</th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>

              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="px-4 py-3 text-foreground">{entry.entryDate}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          entry.type === "DEBIT"
                            ? "bg-red-50 text-red-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {entry.metalType ?? "Money"}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {entry.sourceType}
                      {entry.paymentMethod ? (
                        <span className="block text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[entry.paymentMethod] ?? entry.paymentMethod}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {entry.description || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {entry.invoiceId && entry.invoiceNumber ? (
                        <Link
                          href={`/billing/${entry.invoiceId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          {entry.invoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        entry.type === "DEBIT" ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {formatEntryAmount(entry)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}