import type { Metadata } from "next"

import {
  getSalesReport,
  getInventoryValuationReport,
  getKarigarOutstandingReport,
  getCustomerDuesReport,
  getGoldFlowReport,
  getMetalWiseReport,
  getSalesByUserReport,
  getVendorPurchaseReport,
  getItemLedgerReport,
  getAvailableFinancialYears,
} from "@/lib/actions/report-actions"

import { ReportsTabs } from "@/components/reports/reports-tabs"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "Reports",
}

/** All 9 reports run in parallel on every load (see the Promise.all below) —
 *  Item Ledger and Gold Flow especially can exceed the platform's default
 *  budget as data grows. Also covers "Email this report"/"Email all
 *  reports" (lib/actions/report-email-actions.ts), which Next.js runs
 *  under this same route segment's config when invoked from this page. */
export const maxDuration = 60

type Props = {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function ReportsPage({ searchParams }: Props) {
  const { from, to } = await searchParams
  const range = { from, to }

  const [
    sales,
    valuation,
    karigarOutstanding,
    customerDues,
    goldFlow,
    metalWise,
    salesByUser,
    vendorPurchase,
    itemLedger,
    financialYears,
  ] = await Promise.all([
      getSalesReport(range),
      getInventoryValuationReport(),
      getKarigarOutstandingReport(),
      getCustomerDuesReport(),
      getGoldFlowReport(range),
      getMetalWiseReport(range),
      getSalesByUserReport(range),
      getVendorPurchaseReport(range),
      getItemLedgerReport(),
      getAvailableFinancialYears(),
    ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Reports"
        description="Sales, inventory, artisan, and party due summaries."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
      />

      <ReportsTabs
        sales={sales}
        valuation={valuation}
        karigarOutstanding={karigarOutstanding}
        customerDues={customerDues}
        goldFlow={goldFlow}
        metalWise={metalWise}
        salesByUser={salesByUser}
        vendorPurchase={vendorPurchase}
        itemLedger={itemLedger}
        financialYears={financialYears}
      />
    </main>
  )
}
