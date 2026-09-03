"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { RecordHoverCard } from "@/components/shared/record-hover-card"

import { useMemo, useState } from "react"

import { ExportMenu } from "@/components/shared/export-menu"
import { ReportDateFilter } from "@/components/reports/report-date-filter"
import { useReportTable } from "@/components/reports/use-report-table"
import { ReportSearchBar, SortableTh, ReportPagination } from "@/components/reports/report-table-controls"

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

type MetalWiseRow = {
  metalId: string
  metalName: string
  purchasedCount: number
  purchasedWeight: number
  purchasedAmount: number
  soldCount: number
  soldWeight: number
  soldAmount: number
  inStockCount: number
  inStockWeight: number
  inStockValue: number
  withKarigarWeight: number
  reconciliationGap: number
}

type MetalWise = {
  metals: MetalWiseRow[]
}

type SalesByUserRow = {
  userId: string | null
  name: string
  invoiceCount: number
  totalRevenue: number
  totalCollected: number
  totalOutstanding: number
  firstSale: Date | null
  lastSale: Date | null
}

type SalesByUser = {
  rows: SalesByUserRow[]
  totalRevenue: number
  invoiceCount: number
  unattributedCount: number
}

type VendorPurchaseRow = {
  vendorId: string
  vendorName: string
  purchaseCount: number
  totalQuantity: number
  totalWeight: number
  totalAmount: number
  paidAmount: number
  balanceAmount: number
  firstPurchase: Date | null
  lastPurchase: Date | null
}

type VendorPurchase = {
  rows: VendorPurchaseRow[]
  vendorCount: number
  purchaseCount: number
  totalAmount: number
  balanceAmount: number
}

type ItemLedgerEvent = { date: string; label: string }

type ItemLedgerRow = {
  stockId: string
  stockCode: string
  productName: string
  status: string
  quantityRemaining: number
  netWeight: number
  purchaseDate: string | null
  purchaseQuantity: number | null
  vendorName: string | null
  purchasedBy: string
  totalSoldQuantity: number
  lastSaleDate: string | null
  soldTo: string
  soldBy: string
  history: ItemLedgerEvent[]
}

type ItemLedger = {
  rows: ItemLedgerRow[]
  itemCount: number
}

type ReportsTabsProps = {
  sales: SalesReport
  valuation: InventoryValuation
  karigarOutstanding: KarigarOutstanding
  customerDues: CustomerDues
  goldFlow: GoldFlow
  metalWise: MetalWise
  salesByUser: SalesByUser
  vendorPurchase: VendorPurchase
  itemLedger: ItemLedger
}

function reportDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-IN") : "-"
}

/** Money for the report cards; the columns print raw rupees themselves. */
function reportInr(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return null
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value))
}

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "byUser", label: "Sales by User" },
  { key: "vendorPurchase", label: "Vendor Purchase" },
  { key: "inventory", label: "Inventory Valuation" },
  { key: "karigar", label: "Karigar Outstanding" },
  { key: "dues", label: "Customer Dues" },
  { key: "goldFlow", label: "Gold Flow" },
  { key: "metalWise", label: "By Metal" },
  { key: "itemLedger", label: "Item Ledger" },
] as const

type TabKey = (typeof TABS)[number]["key"]

// The 5 report actions that accept a DateRange (see report-actions.ts) —
// the other 4 are point-in-time snapshots (current stock, currently open
// karigar jobs, current customer dues, an item's full lifecycle) that a
// date range has no meaning for.
const DATE_AWARE_TABS = new Set<TabKey>(["sales", "byUser", "vendorPurchase", "goldFlow", "metalWise"])

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

export function ReportsTabs({
  sales,
  valuation,
  karigarOutstanding,
  customerDues,
  goldFlow,
  metalWise,
  salesByUser,
  vendorPurchase,
  itemLedger,
}: ReportsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("sales")
  const searchParams = useSearchParams()

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ type: activeTab })
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (DATE_AWARE_TABS.has(activeTab)) {
      if (from) params.set("from", from)
      if (to) params.set("to", to)
    }
    return `/reports/export?${params.toString()}`
  }, [activeTab, searchParams])

  // One useReportTable per tab's row list, called unconditionally (hooks
  // can't be conditional on activeTab) — each is cheap client-side memo
  // work over data that's already in memory, so running all 9 regardless
  // of which tab is showing costs nothing observable.
  const salesTable = useReportTable(sales.invoices, {
    searchText: (row) => `${row.invoiceNumber} ${row.customerName} ${row.status}`,
    getSortValue: (row, key) => {
      switch (key) {
        case "invoiceNumber": return row.invoiceNumber
        case "date": return row.invoiceDate
        case "customer": return row.customerName
        case "total": return row.totalAmount
        case "balance": return row.balanceAmount
        default: return null
      }
    },
    defaultSortKey: "date",
  })

  const byUserTable = useReportTable(salesByUser.rows, {
    searchText: (row) => row.name,
    getSortValue: (row, key) => {
      switch (key) {
        case "name": return row.name
        case "invoices": return row.invoiceCount
        case "revenue": return row.totalRevenue
        case "collected": return row.totalCollected
        case "outstanding": return row.totalOutstanding
        case "lastSale": return row.lastSale ? new Date(row.lastSale).getTime() : null
        default: return null
      }
    },
    defaultSortKey: "revenue",
  })

  const vendorPurchaseTable = useReportTable(vendorPurchase.rows, {
    searchText: (row) => row.vendorName,
    getSortValue: (row, key) => {
      switch (key) {
        case "vendor": return row.vendorName
        case "purchases": return row.purchaseCount
        case "qty": return row.totalQuantity
        case "weight": return row.totalWeight
        case "amount": return row.totalAmount
        case "paid": return row.paidAmount
        case "balance": return row.balanceAmount
        case "lastPurchase": return row.lastPurchase ? new Date(row.lastPurchase).getTime() : null
        default: return null
      }
    },
    defaultSortKey: "amount",
  })

  const inventoryTable = useReportTable(valuation.byStatus, {
    searchText: (row) => row.status,
    getSortValue: (row, key) => {
      switch (key) {
        case "status": return row.status
        case "count": return row.count
        case "netWeight": return row.netWeight
        case "estimatedValue": return row.estimatedValue
        default: return null
      }
    },
    pageSize: 50,
  })

  const karigarTable = useReportTable(karigarOutstanding.byKarigar, {
    searchText: (row) => row.name,
    getSortValue: (row, key) => {
      switch (key) {
        case "name": return row.name
        case "jobs": return row.jobs
        case "weightOut": return row.weightOut
        default: return null
      }
    },
    defaultSortKey: "weightOut",
  })

  const duesTable = useReportTable(customerDues.customers, {
    searchText: (row) => `${row.name} ${row.phone ?? ""}`,
    getSortValue: (row, key) => {
      switch (key) {
        case "name": return row.name
        case "phone": return row.phone
        case "invoices": return row.invoiceCount
        case "totalDue": return row.totalDue
        default: return null
      }
    },
    defaultSortKey: "totalDue",
  })

  const metalWiseTable = useReportTable(metalWise.metals, {
    searchText: (row) => row.metalName,
    getSortValue: (row, key) => {
      switch (key) {
        case "metal": return row.metalName
        case "purchasedWeight": return row.purchasedWeight
        case "soldWeight": return row.soldWeight
        case "inStockWeight": return row.inStockWeight
        case "withKarigarWeight": return row.withKarigarWeight
        case "reconciliationGap": return Math.abs(row.reconciliationGap)
        default: return null
      }
    },
    defaultSortKey: "metal",
    defaultSortDir: "asc",
    pageSize: 50,
  })

  const itemLedgerTable = useReportTable(itemLedger.rows, {
    searchText: (row) =>
      `${row.stockCode} ${row.productName} ${row.status} ${row.vendorName ?? ""} ${row.soldTo} ${row.soldBy}`,
    getSortValue: (row, key) => {
      switch (key) {
        case "item": return `${row.productName} ${row.stockCode}`
        case "status": return row.status
        case "purchaseDate": return row.purchaseDate ? new Date(row.purchaseDate).getTime() : null
        case "sold": return row.lastSaleDate ? new Date(row.lastSaleDate).getTime() : null
        case "qty": return row.quantityRemaining
        default: return null
      }
    },
    defaultSortKey: "purchaseDate",
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b">
        <div className="flex gap-2">
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

        <div className="pb-2">
          <ExportMenu
            href={exportHref}
            label={`Export ${TABS.find((tab) => tab.key === activeTab)?.label}`}
          />
        </div>
      </div>

      <ReportDateFilter applies={DATE_AWARE_TABS.has(activeTab)} />

      {activeTab === "sales" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard title="Invoices" value={sales.invoiceCount} />
            <StatCard title="Total Revenue" value={`₹${sales.totalRevenue.toFixed(2)}`} />
            <StatCard title="Outstanding" value={`₹${sales.totalOutstanding.toFixed(2)}`} />
          </div>

          <ReportSearchBar
            value={salesTable.search}
            onChange={salesTable.setSearch}
            placeholder="Search invoice #, customer, status..."
            resultSummary={`${salesTable.totalCount} of ${salesTable.rawCount}`}
          />

          <div className="overflow-hidden rounded-xl border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <SortableTh label="Invoice #" sortKey="invoiceNumber" activeSortKey={salesTable.sortKey} sortDir={salesTable.sortDir} onSort={salesTable.toggleSort} />
                  <SortableTh label="Date" sortKey="date" activeSortKey={salesTable.sortKey} sortDir={salesTable.sortDir} onSort={salesTable.toggleSort} />
                  <SortableTh label="Customer" sortKey="customer" activeSortKey={salesTable.sortKey} sortDir={salesTable.sortDir} onSort={salesTable.toggleSort} />
                  <SortableTh label="Total" sortKey="total" activeSortKey={salesTable.sortKey} sortDir={salesTable.sortDir} onSort={salesTable.toggleSort} />
                  <SortableTh label="Balance" sortKey="balance" activeSortKey={salesTable.sortKey} sortDir={salesTable.sortDir} onSort={salesTable.toggleSort} />
                </tr>
              </thead>
              <tbody>
                {salesTable.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      No invoices match this range/search.
                    </td>
                  </tr>
                ) : (
                  salesTable.pageRows.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        <RecordHoverCard
                          label={invoice.invoiceNumber}
                          href={`/billing/${invoice.id}?from=${encodeURIComponent("/reports")}`}
                          title={invoice.invoiceNumber}
                          subtitle={invoice.customerName}
                          footerLabel="Open invoice"
                          className="text-primary underline-offset-4 hover:underline"
                          sections={[
                            {
                              fields: [
                                {
                                  label: "Date",
                                  value: new Date(invoice.invoiceDate).toLocaleDateString("en-IN"),
                                },
                                { label: "Customer", value: invoice.customerName },
                              ],
                            },
                            {
                              fields: [
                                { label: "Total", value: reportInr(invoice.totalAmount) },
                                {
                                  label: "Balance",
                                  value:
                                    invoice.balanceAmount > 0
                                      ? reportInr(invoice.balanceAmount)
                                      : "Settled",
                                },
                                {
                                  label: "Received",
                                  value: reportInr(
                                    invoice.totalAmount - invoice.balanceAmount,
                                  ),
                                },
                              ],
                            },
                          ]}
                        />
                      </td>
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
            <ReportPagination
              page={salesTable.page}
              totalPages={salesTable.totalPages}
              totalCount={salesTable.totalCount}
              pageSize={salesTable.pageSize}
              onPageChange={salesTable.setPage}
            />
          </div>
        </div>
      )}

      {activeTab === "byUser" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard title="Sellers" value={salesByUser.rows.length} />
            <StatCard title="Invoices" value={salesByUser.invoiceCount} />
            <StatCard
              title="Total Revenue"
              value={`₹${salesByUser.totalRevenue.toFixed(2)}`}
            />
          </div>

          {/* Said plainly rather than left for someone to notice the numbers
              not adding up: invoices raised before the seller was recorded
              cannot be attributed to anyone. */}
          {salesByUser.unattributedCount > 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              {salesByUser.unattributedCount}{" "}
              {salesByUser.unattributedCount === 1 ? "invoice was" : "invoices were"}{" "}
              raised before the seller was recorded, and appear under &ldquo;Not
              recorded&rdquo;. Invoices from now on carry the seller.
            </p>
          ) : null}

          <ReportSearchBar
            value={byUserTable.search}
            onChange={byUserTable.setSearch}
            placeholder="Search user..."
            resultSummary={`${byUserTable.totalCount} of ${byUserTable.rawCount}`}
          />

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <SortableTh label="User" sortKey="name" activeSortKey={byUserTable.sortKey} sortDir={byUserTable.sortDir} onSort={byUserTable.toggleSort} />
                    <SortableTh label="Invoices" sortKey="invoices" activeSortKey={byUserTable.sortKey} sortDir={byUserTable.sortDir} onSort={byUserTable.toggleSort} align="right" />
                    <SortableTh label="Revenue" sortKey="revenue" activeSortKey={byUserTable.sortKey} sortDir={byUserTable.sortDir} onSort={byUserTable.toggleSort} align="right" />
                    <SortableTh label="Collected" sortKey="collected" activeSortKey={byUserTable.sortKey} sortDir={byUserTable.sortDir} onSort={byUserTable.toggleSort} align="right" />
                    <SortableTh label="Outstanding" sortKey="outstanding" activeSortKey={byUserTable.sortKey} sortDir={byUserTable.sortDir} onSort={byUserTable.toggleSort} align="right" />
                    <th className="px-4 py-3 text-right font-medium">Avg / invoice</th>
                    <SortableTh label="Last sale" sortKey="lastSale" activeSortKey={byUserTable.sortKey} sortDir={byUserTable.sortDir} onSort={byUserTable.toggleSort} />
                  </tr>
                </thead>

                <tbody>
                  {byUserTable.pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                        No sales match this period/search.
                      </td>
                    </tr>
                  ) : (
                    byUserTable.pageRows.map((row) => (
                      <tr
                        key={row.userId ?? "unrecorded"}
                        className="border-b last:border-0"
                      >
                        <td className="px-4 py-3 font-medium">
                          <RecordHoverCard
                            label={
                              row.userId ? (
                                row.name
                              ) : (
                                <span className="text-muted-foreground">{row.name}</span>
                              )
                            }
                            title={row.name}
                            subtitle="Sales by this user"
                            sections={[
                              {
                                fields: [
                                  { label: "Invoices", value: row.invoiceCount },
                                  { label: "Revenue", value: reportInr(row.totalRevenue) },
                                  { label: "Collected", value: reportInr(row.totalCollected) },
                                  { label: "Outstanding", value: reportInr(row.totalOutstanding) },
                                ],
                              },
                              {
                                fields: [
                                  {
                                    label: "Average",
                                    value:
                                      row.invoiceCount > 0
                                        ? reportInr(row.totalRevenue / row.invoiceCount)
                                        : null,
                                  },
                                  {
                                    label: "First sale",
                                    value: row.firstSale
                                      ? new Date(row.firstSale).toLocaleDateString("en-IN")
                                      : null,
                                  },
                                  {
                                    label: "Last sale",
                                    value: row.lastSale
                                      ? new Date(row.lastSale).toLocaleDateString("en-IN")
                                      : null,
                                  },
                                ],
                              },
                            ]}
                          />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.invoiceCount}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ₹{row.totalRevenue.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ₹{row.totalCollected.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-600">
                          {row.totalOutstanding > 0
                            ? `₹${row.totalOutstanding.toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.invoiceCount > 0
                            ? `₹${(row.totalRevenue / row.invoiceCount).toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {row.lastSale
                            ? new Date(row.lastSale).toLocaleDateString("en-IN")
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <ReportPagination
                page={byUserTable.page}
                totalPages={byUserTable.totalPages}
                totalCount={byUserTable.totalCount}
                pageSize={byUserTable.pageSize}
                onPageChange={byUserTable.setPage}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === "vendorPurchase" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard title="Vendors" value={vendorPurchase.vendorCount} />
            <StatCard title="Purchases" value={vendorPurchase.purchaseCount} />
            <StatCard
              title="Total Purchased"
              value={`₹${vendorPurchase.totalAmount.toFixed(2)}`}
            />
          </div>

          <ReportSearchBar
            value={vendorPurchaseTable.search}
            onChange={vendorPurchaseTable.setSearch}
            placeholder="Search vendor..."
            resultSummary={`${vendorPurchaseTable.totalCount} of ${vendorPurchaseTable.rawCount}`}
          />

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <SortableTh label="Vendor" sortKey="vendor" activeSortKey={vendorPurchaseTable.sortKey} sortDir={vendorPurchaseTable.sortDir} onSort={vendorPurchaseTable.toggleSort} />
                    <SortableTh label="Purchases" sortKey="purchases" activeSortKey={vendorPurchaseTable.sortKey} sortDir={vendorPurchaseTable.sortDir} onSort={vendorPurchaseTable.toggleSort} align="right" />
                    <SortableTh label="Qty" sortKey="qty" activeSortKey={vendorPurchaseTable.sortKey} sortDir={vendorPurchaseTable.sortDir} onSort={vendorPurchaseTable.toggleSort} align="right" />
                    <SortableTh label="Weight" sortKey="weight" activeSortKey={vendorPurchaseTable.sortKey} sortDir={vendorPurchaseTable.sortDir} onSort={vendorPurchaseTable.toggleSort} align="right" />
                    <SortableTh label="Amount" sortKey="amount" activeSortKey={vendorPurchaseTable.sortKey} sortDir={vendorPurchaseTable.sortDir} onSort={vendorPurchaseTable.toggleSort} align="right" />
                    <SortableTh label="Paid" sortKey="paid" activeSortKey={vendorPurchaseTable.sortKey} sortDir={vendorPurchaseTable.sortDir} onSort={vendorPurchaseTable.toggleSort} align="right" />
                    <SortableTh label="Balance" sortKey="balance" activeSortKey={vendorPurchaseTable.sortKey} sortDir={vendorPurchaseTable.sortDir} onSort={vendorPurchaseTable.toggleSort} align="right" />
                    <SortableTh label="Last purchase" sortKey="lastPurchase" activeSortKey={vendorPurchaseTable.sortKey} sortDir={vendorPurchaseTable.sortDir} onSort={vendorPurchaseTable.toggleSort} />
                  </tr>
                </thead>

                <tbody>
                  {vendorPurchaseTable.pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                        No purchases match this period/search.
                      </td>
                    </tr>
                  ) : (
                    vendorPurchaseTable.pageRows.map((row) => (
                      <tr key={row.vendorId} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">
                          <RecordHoverCard
                            label={row.vendorName}
                            title={row.vendorName}
                            subtitle="Purchases from this vendor"
                            sections={[
                              {
                                fields: [
                                  { label: "Purchases", value: row.purchaseCount },
                                  { label: "Amount", value: reportInr(row.totalAmount) },
                                  { label: "Paid", value: reportInr(row.paidAmount) },
                                  { label: "Balance", value: reportInr(row.balanceAmount) },
                                ],
                              },
                              {
                                fields: [
                                  {
                                    label: "First purchase",
                                    value: row.firstPurchase
                                      ? new Date(row.firstPurchase).toLocaleDateString("en-IN")
                                      : null,
                                  },
                                  {
                                    label: "Last purchase",
                                    value: row.lastPurchase
                                      ? new Date(row.lastPurchase).toLocaleDateString("en-IN")
                                      : null,
                                  },
                                ],
                              },
                            ]}
                          />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.purchaseCount}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.totalQuantity}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.totalWeight.toFixed(3)} g
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ₹{row.totalAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ₹{row.paidAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-600">
                          {row.balanceAmount > 0
                            ? `₹${row.balanceAmount.toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {row.lastPurchase
                            ? new Date(row.lastPurchase).toLocaleDateString("en-IN")
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <ReportPagination
                page={vendorPurchaseTable.page}
                totalPages={vendorPurchaseTable.totalPages}
                totalCount={vendorPurchaseTable.totalCount}
                pageSize={vendorPurchaseTable.pageSize}
                onPageChange={vendorPurchaseTable.setPage}
              />
            </div>
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

          <ReportSearchBar
            value={inventoryTable.search}
            onChange={inventoryTable.setSearch}
            placeholder="Search status..."
            resultSummary={`${inventoryTable.totalCount} of ${inventoryTable.rawCount}`}
          />

          <div className="overflow-hidden rounded-xl border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <SortableTh label="Status" sortKey="status" activeSortKey={inventoryTable.sortKey} sortDir={inventoryTable.sortDir} onSort={inventoryTable.toggleSort} />
                  <SortableTh label="Count" sortKey="count" activeSortKey={inventoryTable.sortKey} sortDir={inventoryTable.sortDir} onSort={inventoryTable.toggleSort} />
                  <SortableTh label="Net Weight (g)" sortKey="netWeight" activeSortKey={inventoryTable.sortKey} sortDir={inventoryTable.sortDir} onSort={inventoryTable.toggleSort} />
                  <SortableTh label="Estimated Value" sortKey="estimatedValue" activeSortKey={inventoryTable.sortKey} sortDir={inventoryTable.sortDir} onSort={inventoryTable.toggleSort} />
                </tr>
              </thead>
              <tbody>
                {inventoryTable.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No stock statuses match this search.
                    </td>
                  </tr>
                ) : (
                  inventoryTable.pageRows.map((row) => (
                    <tr key={row.status} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <RecordHoverCard
                          label={row.status}
                          title={row.status}
                          subtitle="Stock valuation"
                          sections={[
                            {
                              fields: [
                                { label: "Items", value: row.count },
                                { label: "Net weight", value: `${row.netWeight.toFixed(3)} g` },
                                {
                                  label: "Estimated value",
                                  value: reportInr(row.estimatedValue),
                                },
                                {
                                  // The figure the row cannot show: what one
                                  // piece in this state is worth on average.
                                  label: "Average per item",
                                  value:
                                    row.count > 0
                                      ? reportInr(row.estimatedValue / row.count)
                                      : null,
                                },
                              ],
                            },
                          ]}
                        />
                      </td>
                      <td className="px-4 py-3">{row.count}</td>
                      <td className="px-4 py-3">{row.netWeight.toFixed(3)}</td>
                      <td className="px-4 py-3">₹{row.estimatedValue.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <ReportPagination
              page={inventoryTable.page}
              totalPages={inventoryTable.totalPages}
              totalCount={inventoryTable.totalCount}
              pageSize={inventoryTable.pageSize}
              onPageChange={inventoryTable.setPage}
            />
          </div>
        </div>
      )}

      {activeTab === "karigar" && (
        <div className="space-y-6">
          <StatCard title="Open Jobs" value={karigarOutstanding.openJobCount} />

          <ReportSearchBar
            value={karigarTable.search}
            onChange={karigarTable.setSearch}
            placeholder="Search karigar..."
            resultSummary={`${karigarTable.totalCount} of ${karigarTable.rawCount}`}
          />

          <div className="overflow-hidden rounded-xl border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <SortableTh label="Karigar" sortKey="name" activeSortKey={karigarTable.sortKey} sortDir={karigarTable.sortDir} onSort={karigarTable.toggleSort} />
                  <SortableTh label="Open Jobs" sortKey="jobs" activeSortKey={karigarTable.sortKey} sortDir={karigarTable.sortDir} onSort={karigarTable.toggleSort} />
                  <SortableTh label="Weight Out (g)" sortKey="weightOut" activeSortKey={karigarTable.sortKey} sortDir={karigarTable.sortDir} onSort={karigarTable.toggleSort} />
                </tr>
              </thead>
              <tbody>
                {karigarTable.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      No open karigar jobs match this search.
                    </td>
                  </tr>
                ) : (
                  karigarTable.pageRows.map((row) => (
                    <tr key={row.name} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        <RecordHoverCard
                          label={row.name}
                          title={row.name}
                          subtitle="Outstanding with karigar"
                          sections={[
                            {
                              fields: [
                                { label: "Open jobs", value: row.jobs },
                                {
                                  label: "Weight out",
                                  value: `${row.weightOut.toFixed(3)} g`,
                                },
                                {
                                  label: "Average per job",
                                  value:
                                    row.jobs > 0
                                      ? `${(row.weightOut / row.jobs).toFixed(3)} g`
                                      : null,
                                },
                              ],
                            },
                          ]}
                        />
                      </td>
                      <td className="px-4 py-3">{row.jobs}</td>
                      <td className="px-4 py-3">{row.weightOut.toFixed(3)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <ReportPagination
              page={karigarTable.page}
              totalPages={karigarTable.totalPages}
              totalCount={karigarTable.totalCount}
              pageSize={karigarTable.pageSize}
              onPageChange={karigarTable.setPage}
            />
          </div>
        </div>
      )}

      {activeTab === "dues" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatCard title="Customers with Dues" value={customerDues.customerCount} />
            <StatCard title="Total Outstanding" value={`₹${customerDues.totalDue.toFixed(2)}`} />
          </div>

          <ReportSearchBar
            value={duesTable.search}
            onChange={duesTable.setSearch}
            placeholder="Search customer, phone..."
            resultSummary={`${duesTable.totalCount} of ${duesTable.rawCount}`}
          />

          <div className="overflow-hidden rounded-xl border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <SortableTh label="Customer" sortKey="name" activeSortKey={duesTable.sortKey} sortDir={duesTable.sortDir} onSort={duesTable.toggleSort} />
                  <SortableTh label="Phone" sortKey="phone" activeSortKey={duesTable.sortKey} sortDir={duesTable.sortDir} onSort={duesTable.toggleSort} />
                  <SortableTh label="Invoices" sortKey="invoices" activeSortKey={duesTable.sortKey} sortDir={duesTable.sortDir} onSort={duesTable.toggleSort} />
                  <SortableTh label="Total Due" sortKey="totalDue" activeSortKey={duesTable.sortKey} sortDir={duesTable.sortDir} onSort={duesTable.toggleSort} />
                </tr>
              </thead>
              <tbody>
                {duesTable.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No outstanding customer dues match this search.
                    </td>
                  </tr>
                ) : (
                  duesTable.pageRows.map((customer) => (
                    <tr key={customer.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        <RecordHoverCard
                          label={customer.name}
                          href={`/customers/${customer.id}?from=${encodeURIComponent("/reports")}`}
                          title={customer.name}
                          subtitle={customer.phone ?? undefined}
                          footerLabel="View customer"
                          className="text-primary underline-offset-4 hover:underline"
                          sections={[
                            {
                              fields: [
                                { label: "Phone", value: customer.phone },
                                { label: "Unpaid invoices", value: customer.invoiceCount },
                              ],
                            },
                            {
                              fields: [
                                { label: "Total due", value: reportInr(customer.totalDue) },
                                {
                                  label: "Average per invoice",
                                  value:
                                    customer.invoiceCount > 0
                                      ? reportInr(customer.totalDue / customer.invoiceCount)
                                      : null,
                                },
                              ],
                            },
                          ]}
                        />
                      </td>
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
            <ReportPagination
              page={duesTable.page}
              totalPages={duesTable.totalPages}
              totalCount={duesTable.totalCount}
              pageSize={duesTable.pageSize}
              onPageChange={duesTable.setPage}
            />
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

      {activeTab === "metalWise" && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            One row per metal your store has configured in Settings → Metals &amp; Categories —
            add a new metal there and it appears here automatically, no code change needed.
          </p>

          <ReportSearchBar
            value={metalWiseTable.search}
            onChange={metalWiseTable.setSearch}
            placeholder="Search metal..."
            resultSummary={`${metalWiseTable.totalCount} of ${metalWiseTable.rawCount}`}
          />

          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <SortableTh label="Metal" sortKey="metal" activeSortKey={metalWiseTable.sortKey} sortDir={metalWiseTable.sortDir} onSort={metalWiseTable.toggleSort} />
                  <SortableTh label="Purchased" sortKey="purchasedWeight" activeSortKey={metalWiseTable.sortKey} sortDir={metalWiseTable.sortDir} onSort={metalWiseTable.toggleSort} />
                  <SortableTh label="Sold" sortKey="soldWeight" activeSortKey={metalWiseTable.sortKey} sortDir={metalWiseTable.sortDir} onSort={metalWiseTable.toggleSort} />
                  <SortableTh label="In Stock" sortKey="inStockWeight" activeSortKey={metalWiseTable.sortKey} sortDir={metalWiseTable.sortDir} onSort={metalWiseTable.toggleSort} />
                  <SortableTh label="With Karigar" sortKey="withKarigarWeight" activeSortKey={metalWiseTable.sortKey} sortDir={metalWiseTable.sortDir} onSort={metalWiseTable.toggleSort} />
                  <SortableTh label="Status" sortKey="reconciliationGap" activeSortKey={metalWiseTable.sortKey} sortDir={metalWiseTable.sortDir} onSort={metalWiseTable.toggleSort} />
                </tr>
              </thead>
              <tbody>
                {metalWiseTable.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      No metals match this search.
                    </td>
                  </tr>
                ) : (
                  metalWiseTable.pageRows.map((row) => (
                    <tr key={row.metalId} className="border-b last:border-0 align-top">
                      <td className="px-4 py-3 font-medium">
                        {/* The row splits each metal across five columns;
                            the card puts the whole position in one place. */}
                        <RecordHoverCard
                          label={row.metalName}
                          title={row.metalName}
                          subtitle="Metal position"
                          sections={[
                            {
                              fields: [
                                {
                                  label: "Purchased",
                                  value: `${row.purchasedWeight.toFixed(3)} g · ${row.purchasedCount}`,
                                },
                                {
                                  label: "Sold",
                                  value: `${row.soldWeight.toFixed(3)} g · ${row.soldCount}`,
                                },
                                {
                                  label: "In stock",
                                  value: `${row.inStockWeight.toFixed(3)} g · ${row.inStockCount}`,
                                },
                              ],
                            },
                            {
                              fields: [
                                { label: "Purchase value", value: reportInr(row.purchasedAmount) },
                                { label: "Sale value", value: reportInr(row.soldAmount) },
                                { label: "Stock value", value: reportInr(row.inStockValue) },
                              ],
                            },
                          ]}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.purchasedWeight.toFixed(3)}g</div>
                        <div className="text-xs text-muted-foreground">
                          {row.purchasedCount} item(s) · ₹{row.purchasedAmount.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.soldWeight.toFixed(3)}g</div>
                        <div className="text-xs text-muted-foreground">
                          {row.soldCount} item(s) · ₹{row.soldAmount.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.inStockWeight.toFixed(3)}g</div>
                        <div className="text-xs text-muted-foreground">
                          {row.inStockCount} item(s) · ₹{row.inStockValue.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-4 py-3">{row.withKarigarWeight.toFixed(3)}g</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            Math.abs(row.reconciliationGap) > 0.01
                              ? "bg-red-50 text-red-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {Math.abs(row.reconciliationGap) > 0.01
                            ? `Gap: ${row.reconciliationGap.toFixed(3)}g`
                            : "Reconciled"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <ReportPagination
              page={metalWiseTable.page}
              totalPages={metalWiseTable.totalPages}
              totalCount={metalWiseTable.totalCount}
              pageSize={metalWiseTable.pageSize}
              onPageChange={metalWiseTable.setPage}
            />
          </div>
        </div>
      )}

      {activeTab === "itemLedger" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatCard title="Items" value={itemLedger.itemCount} />
            <StatCard
              title="Sold Items"
              value={itemLedger.rows.filter((row) => row.totalSoldQuantity > 0).length}
            />
          </div>

          <ReportSearchBar
            value={itemLedgerTable.search}
            onChange={itemLedgerTable.setSearch}
            placeholder="Search stock code, item, vendor, customer..."
            resultSummary={`${itemLedgerTable.totalCount} of ${itemLedgerTable.rawCount}`}
          />

          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <SortableTh label="Item" sortKey="item" activeSortKey={itemLedgerTable.sortKey} sortDir={itemLedgerTable.sortDir} onSort={itemLedgerTable.toggleSort} />
                  <SortableTh label="Status" sortKey="status" activeSortKey={itemLedgerTable.sortKey} sortDir={itemLedgerTable.sortDir} onSort={itemLedgerTable.toggleSort} />
                  <SortableTh label="Purchased" sortKey="purchaseDate" activeSortKey={itemLedgerTable.sortKey} sortDir={itemLedgerTable.sortDir} onSort={itemLedgerTable.toggleSort} />
                  <SortableTh label="Sold" sortKey="sold" activeSortKey={itemLedgerTable.sortKey} sortDir={itemLedgerTable.sortDir} onSort={itemLedgerTable.toggleSort} />
                  <th className="px-4 py-3 text-left font-medium">History</th>
                </tr>
              </thead>
              <tbody>
                {itemLedgerTable.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      No inventory items match this search.
                    </td>
                  </tr>
                ) : (
                  itemLedgerTable.pageRows.map((row) => (
                    <tr key={row.stockId} className="border-b last:border-0 align-top">
                      <td className="px-4 py-3">
                        <RecordHoverCard
                          label={row.stockCode}
                          href={`/inventory/stock/${row.stockId}`}
                          title={row.productName}
                          subtitle={row.stockCode}
                          sections={[
                            {
                              fields: [
                                { label: "Status", value: row.status },
                                { label: "Qty on hand", value: row.quantityRemaining },
                                { label: "Net weight", value: `${row.netWeight.toFixed(3)} g` },
                              ],
                            },
                          ]}
                        />
                        <div className="text-xs text-muted-foreground">{row.productName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                          {row.status}
                        </span>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Qty on hand: {row.quantityRemaining}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{reportDate(row.purchaseDate)}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.purchaseQuantity ? `Qty ${row.purchaseQuantity} · ` : ""}
                          {row.vendorName ?? "Unknown vendor"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Purchased by: {row.purchasedBy}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {row.totalSoldQuantity > 0 ? (
                          <>
                            <div>{reportDate(row.lastSaleDate)}</div>
                            <div className="text-xs text-muted-foreground">
                              Qty {row.totalSoldQuantity} · {row.soldTo}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Sold by: {row.soldBy}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not sold yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.history.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No activity</span>
                        ) : (
                          <RecordHoverCard
                            label={`${row.history.length} event(s)`}
                            title={`${row.productName} — Timeline`}
                            subtitle={row.stockCode}
                            className="text-xs font-medium underline-offset-4 hover:underline"
                            sections={[
                              {
                                fields: row.history.map((event) => ({
                                  label: reportDate(event.date),
                                  value: event.label,
                                })),
                              },
                            ]}
                          />
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <ReportPagination
              page={itemLedgerTable.page}
              totalPages={itemLedgerTable.totalPages}
              totalCount={itemLedgerTable.totalCount}
              pageSize={itemLedgerTable.pageSize}
              onPageChange={itemLedgerTable.setPage}
            />
          </div>
        </div>
      )}
    </div>
  )
}
