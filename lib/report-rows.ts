// lib/report-rows.ts

import {
  getSalesReport,
  getSalesByUserReport,
  getVendorPurchaseReport,
  getInventoryValuationReport,
  getStockReport,
  getKarigarOutstandingReport,
  getCustomerDuesReport,
  getGoldFlowReport,
  getMetalWiseReport,
  getItemLedgerReport,
  type DateRange,
} from "@/lib/actions/report-actions"
import { formatShortDate } from "@/lib/utils"
import { requireStoreScope } from "@/lib/store-context"
import { omitHiddenKeys } from "@/lib/sheet-features"
import { getSheetFeatures } from "@/lib/sheet-features.server"
import { invoiceStatusLabel, stockStatusLabel } from "@/lib/status-labels"

/**
 * Extracted from what was originally app/(dashboard)/reports/export/route.ts's
 * private `buildRows` — flattens any of the /reports dashboard's 9 report
 * types into plain rows, for CSV/Excel export AND (new) emailing a report
 * instead of waiting on it to render, via lib/actions/report-email-actions.ts.
 * One switch, one place both callers share.
 */
export type ReportType =
  | "sales"
  | "byUser"
  | "vendorPurchase"
  | "inventory"
  | "stock"
  | "karigar"
  | "dues"
  | "goldFlow"
  | "metalWise"
  | "itemLedger"

export const ALL_REPORT_TYPES: ReportType[] = [
  "sales",
  "byUser",
  "vendorPurchase",
  "inventory",
  "stock",
  "karigar",
  "dues",
  "goldFlow",
  "metalWise",
  "itemLedger",
]

export const REPORT_LABELS: Record<ReportType, string> = {
  sales: "Sales",
  byUser: "Sales by User",
  vendorPurchase: "Vendor Purchase",
  inventory: "Inventory Valuation",
  stock: "Stock",
  karigar: "Artisan Outstanding",
  dues: "Party Dues",
  goldFlow: "Gold Flow",
  metalWise: "By Metal",
  itemLedger: "Item Ledger",
}

export async function getReportRows(type: ReportType, range: DateRange) {
  switch (type) {
    case "sales": {
      const report = await getSalesReport(range)
      return report.invoices.map((invoice) => ({
        "Invoice #": invoice.invoiceNumber,
        Date: formatShortDate(invoice.invoiceDate),
        Party: invoice.customerName,
        Status: invoiceStatusLabel(invoice.status),
        "Total (₹)": invoice.totalAmount,
        "Balance (₹)": invoice.balanceAmount,
      }))
    }
    case "byUser": {
      const report = await getSalesByUserReport(range)
      return report.rows.map((row) => ({
        User: row.name,
        Invoices: row.invoiceCount,
        "Revenue (₹)": row.totalRevenue,
        "Collected (₹)": row.totalCollected,
        "Outstanding (₹)": row.totalOutstanding,
        "First Sale": row.firstSale ? formatShortDate(row.firstSale) : "",
        "Last Sale": row.lastSale ? formatShortDate(row.lastSale) : "",
      }))
    }
    case "vendorPurchase": {
      const report = await getVendorPurchaseReport(range)
      return report.rows.map((row) => ({
        Vendor: row.vendorName,
        Purchases: row.purchaseCount,
        Qty: row.totalQuantity,
        "Fine Wt 24K (g)": row.totalWeight,
        "Amount (₹)": row.totalAmount,
        "Paid (₹)": row.paidAmount,
        "Balance (₹)": row.balanceAmount,
        "First Purchase": row.firstPurchase ? formatShortDate(row.firstPurchase) : "",
        "Last Purchase": row.lastPurchase ? formatShortDate(row.lastPurchase) : "",
      }))
    }
    case "inventory": {
      const report = await getInventoryValuationReport()
      return report.byStatus.map((row) => ({
        Status: stockStatusLabel(row.status),
        Count: row.count,
        "Fine Wt 24K (g)": row.netWeight,
        "Estimated Value (₹)": row.estimatedValue,
      }))
    }
    case "stock": {
      const report = await getStockReport()
      // No Location column for a store without locations (lib/sheet-features.ts).
      const features = await getSheetFeatures(await requireStoreScope())
      return omitHiddenKeys(report.rows.map((row) => ({
        "Stock Code": row.stockCode,
        "Tag #": row.tagNumber ?? "",
        Product: row.productName,
        "Product Code": row.productCode,
        "Category · Type": row.category,
        Metal: row.metal,
        Purity: row.purity,
        Availability: row.availability === "AVAILABLE" ? "Available" : "Out of Stock",
        Status: stockStatusLabel(row.status),
        "Qty on Hand": row.quantity,
        "Net Weight / pc (g)": row.netWeight,
        "Total Net Weight (g)": row.totalNetWeight,
        "Fine Wt 24K / pc (g)": row.fineWeight,
        "Total Fine Wt 24K (g)": row.totalFineWeight,
        "Estimated Value (₹)": row.estimatedValue,
        Location: row.location,
        "Purchase Date": row.purchaseDate ? formatShortDate(row.purchaseDate) : "",
      })), { Location: "locations" }, features)
    }
    case "karigar": {
      const report = await getKarigarOutstandingReport()
      return report.jobs.map((job) => ({
        "Job #": job.jobNumber ?? "",
        Artisan: job.karigarName,
        "Issue Date": formatShortDate(job.issueDate),
        "Expected Date": job.expectedDate ? formatShortDate(job.expectedDate) : "",
        Metal: job.metalType ?? "",
        "Issue Weight (g)": job.issueWeight ?? "",
        "Issue Fine Wt 24K (g)": job.issueFineWeight ?? "",
      }))
    }
    case "dues": {
      const report = await getCustomerDuesReport()
      return report.customers.map((customer) => ({
        Party: customer.name,
        Phone: customer.phone ?? "",
        Invoices: customer.invoiceCount,
        "Total Due (₹)": customer.totalDue,
      }))
    }
    case "goldFlow": {
      const report = await getGoldFlowReport(range)
      return [
        {
          "Purchased (fine g)": report.purchasedFine,
          "Issued to Artisan (fine g)": report.issuedToKarigarFine,
          "Received from Artisan (fine g)": report.receivedFromKarigarFine,
          "Wastage (fine g)": report.wastageFine,
          "Sold (fine g)": report.soldFine,
          "Remaining Stock (fine g)": report.remainingStockFine,
          "Still with Artisan (fine g)": report.withKarigarFine,
          "Items Sold": report.itemsSoldCount,
          "Items Created": report.itemsCreatedCount,
          "Items Remaining": report.itemsRemainingCount,
          "Reconciliation Gap (fine g)": report.reconciliationGap,
        },
      ]
    }
    case "metalWise": {
      const report = await getMetalWiseReport(range)
      return report.metals.map((row) => ({
        Metal: row.metalName,
        "Purchased Fine Wt 24K (g)": row.purchasedWeight,
        "Purchased Amount (₹)": row.purchasedAmount,
        "Sold Fine Wt 24K (g)": row.soldWeight,
        "Sold Amount (₹)": row.soldAmount,
        "In Stock Fine Wt 24K (g)": row.inStockWeight,
        "In Stock Value (₹)": row.inStockValue,
        "With Artisan Fine Wt 24K (g)": row.withKarigarWeight,
        "Reconciliation Gap (fine g)": row.reconciliationGap,
      }))
    }
    case "itemLedger": {
      const report = await getItemLedgerReport()
      return report.rows.map((row) => ({
        "Stock Code": row.stockCode,
        Item: row.productName,
        Status: stockStatusLabel(row.status),
        "Qty On Hand": row.quantityRemaining,
        "Net Weight (g)": row.netWeight,
        "Fine Wt 24K (g)": row.fineWeight,
        "Purchase Date": row.purchaseDate ? formatShortDate(row.purchaseDate) : "",
        "Purchase Qty": row.purchaseQuantity ?? "",
        Vendor: row.vendorName ?? "",
        "Added By": row.addedBy,
        "Last Sale Date": row.lastSaleDate ? formatShortDate(row.lastSaleDate) : "",
        "Sold Qty": row.totalSoldQuantity,
        "Sold To": row.soldTo,
        "Sold By": row.soldBy,
        "Transaction History": row.history
          .map((event) => `${formatShortDate(event.date)}: ${event.label}`)
          .join(" | "),
      }))
    }
  }
}
