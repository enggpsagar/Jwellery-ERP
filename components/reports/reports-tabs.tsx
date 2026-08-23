"use client"

import { useState } from "react"

type SalesReport = {
  invoiceCount: number
  totalRevenue: number
  totalMakingCharges: number
  totalOutstanding: number
  byMetal: { name: string; weight: number; amount: number }[]
  invoices: {
    id: string
    invoiceNumber: string
    invoiceDate: string
    customerName: string
    status: string
    totalAmount: number
    balanceAmount: number
  }[]
}

type InventoryValuation = {
  totalItems: number
  inStockValue: number
  byStatus: { status: string; count: number; netWeight: number; estimatedValue: number }[]
}

type KarigarOutstanding = {
  openJobCount: number
  byKarigar: { name: string; jobs: number; weightOut: number }[]
  jobs: {
    id: string
    jobNumber: string | null
    karigarName: string
    issueDate: string
    expectedDate: string | null
    issueWeight: number | null
    metalType: string | null
  }[]
}

type CustomerDues = {
  customerCount: number
  totalDue: number
  customers: { id: string; name: string; phone: string | null; totalDue: number; invoiceCount: number }[]
}

type GoldFlow = {
  purchasedFine: number
  issuedToKarigarFine: number
  receivedFromKarigarFine: number
  wastageFine: number
  soldFine: number
  remainingStockFine: number
  withKarigarFine: number
  itemsSoldCount: number
  itemsCreatedCount: number
  itemsRemainingCount: number
  reconciliationGap: number
}

type ReportsTabsProps = {
  sales: SalesReport
  valuation: InventoryValuation
  karigarOutstanding: KarigarOutstanding
  customerDues: CustomerDues
  goldFlow: GoldFlow
}

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "inventory", label: "Inventory Valuation" },
  { key: "karigar", label: "Karigar Outstanding" },
  { key: "dues", label: "Customer Dues" },
  { key: "goldFlow", label: "Gold Flow" },
] as const

type TabKey = (typeof TABS)[number]["key"]

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}

export function ReportsTabs({
  sales,
  valuation,
  karigarOutstanding,
  customerDues,
  goldFlow,
}: ReportsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("sales")

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "sales" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard title="Invoices" value={sales.invoiceCount} />
            <StatCard title="Total Revenue" value={`₹${sales.totalRevenue.toFixed(2)}`} />
            <StatCard title="Outstanding" value={`₹${sales.totalOutstanding.toFixed(2)}`} />
          </div>

          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Invoice #</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Customer</th>
                  <th className="px-4 py-3 text-left font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {sales.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      No invoices in this range.
                    </td>
                  </tr>
                ) : (
                  sales.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td>
                      <td className="px-4 py-3">
                        {new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-4 py-3">{invoice.customerName}</td>
                      <td className="px-4 py-3">₹{invoice.totalAmount.toFixed(2)}</td>
                      <td className="px-4 py-3">₹{invoice.balanceAmount.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "inventory" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatCard title="Total Stock Items" value={valuation.totalItems} />
            <StatCard
              title="In-Stock Value"
              value={`₹${valuation.inStockValue.toFixed(2)}`}
            />
          </div>

          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Count</th>
                  <th className="px-4 py-3 text-left font-medium">Net Weight (g)</th>
                  <th className="px-4 py-3 text-left font-medium">Estimated Value</th>
                </tr>
              </thead>
              <tbody>
                {valuation.byStatus.map((row) => (
                  <tr key={row.status} className="border-b last:border-0">
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3">{row.count}</td>
                    <td className="px-4 py-3">{row.netWeight.toFixed(3)}</td>
                    <td className="px-4 py-3">₹{row.estimatedValue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "karigar" && (
        <div className="space-y-6">
          <StatCard title="Open Jobs" value={karigarOutstanding.openJobCount} />

          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Karigar</th>
                  <th className="px-4 py-3 text-left font-medium">Open Jobs</th>
                  <th className="px-4 py-3 text-left font-medium">Weight Out (g)</th>
                </tr>
              </thead>
              <tbody>
                {karigarOutstanding.byKarigar.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      No open karigar jobs.
                    </td>
                  </tr>
                ) : (
                  karigarOutstanding.byKarigar.map((row) => (
                    <tr key={row.name} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3">{row.jobs}</td>
                      <td className="px-4 py-3">{row.weightOut.toFixed(3)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "dues" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatCard title="Customers with Dues" value={customerDues.customerCount} />
            <StatCard title="Total Outstanding" value={`₹${customerDues.totalDue.toFixed(2)}`} />
          </div>

          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Customer</th>
                  <th className="px-4 py-3 text-left font-medium">Phone</th>
                  <th className="px-4 py-3 text-left font-medium">Invoices</th>
                  <th className="px-4 py-3 text-left font-medium">Total Due</th>
                </tr>
              </thead>
              <tbody>
                {customerDues.customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No outstanding customer dues.
                    </td>
                  </tr>
                ) : (
                  customerDues.customers.map((customer) => (
                    <tr key={customer.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{customer.name}</td>
                      <td className="px-4 py-3">{customer.phone ?? "-"}</td>
                      <td className="px-4 py-3">{customer.invoiceCount}</td>
                      <td className="px-4 py-3 text-red-600 font-medium">
                        ₹{customer.totalDue.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "goldFlow" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <StatCard title="Purchased (fine)" value={`${goldFlow.purchasedFine.toFixed(3)}g`} />
            <StatCard
              title="Issued to Karigar (fine)"
              value={`${goldFlow.issuedToKarigarFine.toFixed(3)}g`}
            />
            <StatCard
              title="Received from Karigar (fine)"
              value={`${goldFlow.receivedFromKarigarFine.toFixed(3)}g`}
            />
            <StatCard title="Wastage (fine)" value={`${goldFlow.wastageFine.toFixed(3)}g`} />
            <StatCard title="Sold (fine)" value={`${goldFlow.soldFine.toFixed(3)}g`} />
            <StatCard
              title="Remaining Stock (fine)"
              value={`${goldFlow.remainingStockFine.toFixed(3)}g`}
            />
            <StatCard
              title="Still with Karigar (fine)"
              value={`${goldFlow.withKarigarFine.toFixed(3)}g`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard title="Items Sold" value={goldFlow.itemsSoldCount} />
            <StatCard title="Items Created" value={goldFlow.itemsCreatedCount} />
            <StatCard title="Items Remaining In Stock" value={goldFlow.itemsRemainingCount} />
          </div>

          <div
            className={`rounded-xl border p-5 shadow-sm ${
              Math.abs(goldFlow.reconciliationGap) > 0.01
                ? "border-red-200 bg-red-50"
                : "border-green-200 bg-green-50"
            }`}
          >
            <p
              className={`text-sm font-medium ${
                Math.abs(goldFlow.reconciliationGap) > 0.01 ? "text-red-700" : "text-green-700"
              }`}
            >
              Reconciliation Gap
            </p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                Math.abs(goldFlow.reconciliationGap) > 0.01 ? "text-red-700" : "text-green-700"
              }`}
            >
              {goldFlow.reconciliationGap.toFixed(3)}g
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {Math.abs(goldFlow.reconciliationGap) > 0.01
                ? "Purchased fine weight does not fully reconcile against sold, wastage, remaining stock, and karigar work-in-progress — investigate the shortfall."
                : "Everything purchased is accounted for across sales, wastage, remaining stock, and karigar work-in-progress."}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
