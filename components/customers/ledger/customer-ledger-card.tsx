// components/customers/ledger/customer-ledger-card.tsx
import {
  getCustomerLedgerEntries,
  getCustomerLedgerSummary,
} from "@/lib/actions/customer-ledger-actions"
import { AddCustomerSaleEntryDialog } from "@/components/customers/ledger/add-customer-sale-entry-dialog"
import { AddCustomerRefundEntryDialog } from "@/components/customers/ledger/add-customer-refund-entry-dialog"

type CustomerLedgerCardProps = {
  customerId: string
}

function formatAmount(value: number) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export async function CustomerLedgerCard({
  customerId,
}: CustomerLedgerCardProps) {
  const [entries, summary] = await Promise.all([
    getCustomerLedgerEntries(customerId),
    getCustomerLedgerSummary(customerId),
  ])

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 rounded-xl border bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Customer Ledger
          </h2>
          <p className="text-sm text-gray-500">
            Add sale and refund/payment entries for this customer.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <AddCustomerSaleEntryDialog customerId={customerId} />
          <AddCustomerRefundEntryDialog customerId={customerId} />
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Opening Balance
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {formatAmount(summary.openingBalance)}
            </p>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Total Sales (Debit)
            </p>
            <p className="mt-1 text-sm font-semibold text-red-600">
              {formatAmount(summary.ledgerDebitTotal)}
            </p>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Total Refund / Received (Credit)
            </p>
            <p className="mt-1 text-sm font-semibold text-green-600">
              {formatAmount(summary.ledgerCreditTotal)}
            </p>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Current Ledger Balance
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {formatAmount(summary.currentBalance)}
            </p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b px-4 py-4">
          <h3 className="text-sm font-semibold text-gray-900">Ledger History</h3>
        </div>

        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No ledger entries found for this customer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Entry Type</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>

              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="px-4 py-3 text-gray-700">{entry.entryDate}</td>
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
                    <td className="px-4 py-3 text-gray-700">{entry.sourceType}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {entry.description || "-"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        entry.type === "DEBIT" ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {formatAmount(entry.amount)}
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