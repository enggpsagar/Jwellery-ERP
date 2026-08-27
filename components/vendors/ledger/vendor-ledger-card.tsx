// components/vendors/ledger/vendor-ledger-card.tsx
import { getVendorLedger } from "@/lib/actions/vendor-actions"

type VendorLedgerCardProps = {
  vendorId: string
}

function formatAmount(value: number) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export async function VendorLedgerCard({ vendorId }: VendorLedgerCardProps) {
  const entries = await getVendorLedger(vendorId)

  return (
    <section className="space-y-4">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Vendor Ledger</h2>
        <p className="text-sm text-muted-foreground">
          Ledger entries recorded against this vendor from purchases and
          payments.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-4">
          <h3 className="text-sm font-semibold text-foreground">Ledger History</h3>
        </div>

        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No ledger entries found for this vendor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-muted-foreground">
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
                    <td className="px-4 py-3 text-foreground">{entry.sourceType}</td>
                    <td className="px-4 py-3 text-foreground">
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
