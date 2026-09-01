export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"

import {
  getSalesReport,
  getSalesByUserReport,
  getVendorPurchaseReport,
  getInventoryValuationReport,
  getKarigarOutstandingReport,
  getCustomerDuesReport,
  getGoldFlowReport,
  getMetalWiseReport,
  getItemLedgerReport,
} from "@/lib/actions/report-actions"
import { buildCsvExport, buildExcelExport } from "@/lib/excel-export"

type ReportType =
  | "sales"
  | "byUser"
  | "vendorPurchase"
  | "inventory"
  | "karigar"
  | "dues"
  | "goldFlow"
  | "metalWise"
  | "itemLedger"
type Format = "csv" | "excel"

const REPORT_LABELS: Record<ReportType, string> = {
  sales: "Sales",
  byUser: "Sales by User",
  vendorPurchase: "Vendor Purchase",
  inventory: "Inventory Valuation",
  karigar: "Karigar Outstanding",
  dues: "Customer Dues",
  goldFlow: "Gold Flow",
  metalWise: "By Metal",
  itemLedger: "Item Ledger",
}

async function buildRows(type: ReportType) {
  switch (type) {
    case "sales": {
      const report = await getSalesReport()
      return report.invoices.map((invoice) => ({
        "Invoice #": invoice.invoiceNumber,
        Date: new Date(invoice.invoiceDate).toLocaleDateString("en-IN"),
        Customer: invoice.customerName,
        Status: invoice.status,
        "Total (₹)": invoice.totalAmount,
        "Balance (₹)": invoice.balanceAmount,
      }))
    }
    case "byUser": {
      const report = await getSalesByUserReport()
      return report.rows.map((row) => ({
        User: row.name,
        Invoices: row.invoiceCount,
        "Revenue (₹)": row.totalRevenue,
        "Collected (₹)": row.totalCollected,
        "Outstanding (₹)": row.totalOutstanding,
        "First Sale": row.firstSale
          ? new Date(row.firstSale).toLocaleDateString("en-IN")
          : "",
        "Last Sale": row.lastSale
          ? new Date(row.lastSale).toLocaleDateString("en-IN")
          : "",
      }))
    }
    case "vendorPurchase": {
      const report = await getVendorPurchaseReport()
      return report.rows.map((row) => ({
        Vendor: row.vendorName,
        Purchases: row.purchaseCount,
        Qty: row.totalQuantity,
        "Weight (g)": row.totalWeight,
        "Amount (₹)": row.totalAmount,
        "Paid (₹)": row.paidAmount,
        "Balance (₹)": row.balanceAmount,
        "First Purchase": row.firstPurchase
          ? new Date(row.firstPurchase).toLocaleDateString("en-IN")
          : "",
        "Last Purchase": row.lastPurchase
          ? new Date(row.lastPurchase).toLocaleDateString("en-IN")
          : "",
      }))
    }
    case "inventory": {
      const report = await getInventoryValuationReport()
      return report.byStatus.map((row) => ({
        Status: row.status,
        Count: row.count,
        "Net Weight (g)": row.netWeight,
        "Estimated Value (₹)": row.estimatedValue,
      }))
    }
    case "karigar": {
      const report = await getKarigarOutstandingReport()
      return report.jobs.map((job) => ({
        "Job #": job.jobNumber ?? "",
        Karigar: job.karigarName,
        "Issue Date": new Date(job.issueDate).toLocaleDateString("en-IN"),
        "Expected Date": job.expectedDate
          ? new Date(job.expectedDate).toLocaleDateString("en-IN")
          : "",
        Metal: job.metalType ?? "",
        "Issue Weight (g)": job.issueWeight ?? "",
      }))
    }
    case "dues": {
      const report = await getCustomerDuesReport()
      return report.customers.map((customer) => ({
        Customer: customer.name,
        Phone: customer.phone ?? "",
        Invoices: customer.invoiceCount,
        "Total Due (₹)": customer.totalDue,
      }))
    }
    case "goldFlow": {
      const report = await getGoldFlowReport()
      return [
        {
          "Purchased (fine g)": report.purchasedFine,
          "Issued to Karigar (fine g)": report.issuedToKarigarFine,
          "Received from Karigar (fine g)": report.receivedFromKarigarFine,
          "Wastage (fine g)": report.wastageFine,
          "Sold (fine g)": report.soldFine,
          "Remaining Stock (fine g)": report.remainingStockFine,
          "Still with Karigar (fine g)": report.withKarigarFine,
          "Items Sold": report.itemsSoldCount,
          "Items Created": report.itemsCreatedCount,
          "Items Remaining": report.itemsRemainingCount,
          "Reconciliation Gap (g)": report.reconciliationGap,
        },
      ]
    }
    case "metalWise": {
      const report = await getMetalWiseReport()
      return report.metals.map((row) => ({
        Metal: row.metalName,
        "Purchased Weight (g)": row.purchasedWeight,
        "Purchased Amount (₹)": row.purchasedAmount,
        "Sold Weight (g)": row.soldWeight,
        "Sold Amount (₹)": row.soldAmount,
        "In Stock Weight (g)": row.inStockWeight,
        "In Stock Value (₹)": row.inStockValue,
        "With Karigar Weight (g)": row.withKarigarWeight,
        "Reconciliation Gap (g)": row.reconciliationGap,
      }))
    }
    case "itemLedger": {
      const report = await getItemLedgerReport()
      return report.rows.map((row) => ({
        "Stock Code": row.stockCode,
        Item: row.productName,
        Status: row.status,
        "Qty On Hand": row.quantityRemaining,
        "Net Weight (g)": row.netWeight,
        "Purchase Date": row.purchaseDate
          ? new Date(row.purchaseDate).toLocaleDateString("en-IN")
          : "",
        "Purchase Qty": row.purchaseQuantity ?? "",
        Vendor: row.vendorName ?? "",
        "Purchased By": row.purchasedBy,
        "Last Sale Date": row.lastSaleDate
          ? new Date(row.lastSaleDate).toLocaleDateString("en-IN")
          : "",
        "Sold Qty": row.totalSoldQuantity,
        "Sold To": row.soldTo,
        "Sold By": row.soldBy,
        "Transaction History": row.history
          .map(
            (event) =>
              `${new Date(event.date).toLocaleDateString("en-IN")}: ${event.label}`,
          )
          .join(" | "),
      }))
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = (searchParams.get("type") ?? "sales") as ReportType
    const format = (searchParams.get("format") ?? "csv") as Format

    if (!(type in REPORT_LABELS)) {
      return NextResponse.json({ success: false, message: "Invalid report type" }, { status: 400 })
    }

    const rows = await buildRows(type)
    const filePrefix = `report-${type}`

    if (format === "excel") {
      const { fileName, fileBase64 } = buildExcelExport(rows, REPORT_LABELS[type], filePrefix)
      return new NextResponse(Buffer.from(fileBase64, "base64"), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      })
    }

    const { fileName, content } = buildCsvExport(rows, filePrefix)
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error("Report export failed:", error)
    return NextResponse.json(
      { success: false, message: "Failed to export report" },
      { status: 500 },
    )
  }
}
