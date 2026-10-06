export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"

import {
  getLedgerEntriesForExport,
  getMetalDailyLedger,
  type LedgerEntryFilters,
} from "@/lib/actions/ledger-actions"
import { requireStoreScope, assertPlanActiveForExport, PlanExpiredError } from "@/lib/store-context"
import { buildCsvExport, buildExcelExport } from "@/lib/excel-export"
import { logger } from "@/lib/logger";

type Scope = "entries" | "metal-wise"
type Format = "csv" | "excel"

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

/** Every entry matching the page's filters (no 500-row cap). */
async function buildEntriesRows(filters: LedgerEntryFilters) {
  const entries = await getLedgerEntriesForExport(filters)

  return entries.map((entry) => ({
    Date: entry.date,
    Account: entry.account,
    "Account Type": entry.accountType ?? "",
    Type: entry.type === "DEBIT" ? "Debit" : "Credit",
    Source: entry.sourceLabel,
    Metal: entry.metalType ?? "",
    "Fine Wt 24K (g)": entry.metalWeight ?? "",
    "Carat Weight (ct)": entry.caratWeight ?? "",
    "Amount (₹)": entry.amount,
    "Payment Method": entry.paymentMethod ? PAYMENT_METHOD_LABELS[entry.paymentMethod] ?? entry.paymentMethod : "",
    Invoice: entry.invoiceNumber ?? "",
    Description: entry.description,
  }))
}

async function buildMetalWiseRows() {
  const { rows } = await getMetalDailyLedger()

  return rows.flatMap((row) =>
    row.units.map((unit) => ({
      Date: row.date,
      Metal: unit.label,
      Unit: unit.isGemstone ? "ct" : "g fine (24K)",
      Purchased: unit.purchasedValue,
      "Purchased Amount (₹)": unit.purchasedAmount,
      Sold: unit.soldValue,
      "Sold Amount (₹)": unit.soldAmount,
      "Closing Balance": unit.closingBalance,
    })),
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const scope = (searchParams.get("scope") ?? "entries") as Scope
    const format = (searchParams.get("format") ?? "csv") as Format

    const storeId = await requireStoreScope()
    await assertPlanActiveForExport(storeId)

    const filters: LedgerEntryFilters = {
      account: searchParams.get("account") || undefined,
      type: searchParams.get("type") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      search: searchParams.get("search") || undefined,
    }

    const rows =
      scope === "metal-wise" ? await buildMetalWiseRows() : await buildEntriesRows(filters)

    const filePrefix = scope === "metal-wise" ? "ledger-metal-wise" : "ledger-entries"

    if (format === "excel") {
      const { fileName, fileBase64 } = buildExcelExport(rows, "Ledger", filePrefix)
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
    if (error instanceof PlanExpiredError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 403 })
    }
    logger.error("Ledger export failed", error)
    return NextResponse.json(
      { success: false, message: "Failed to export ledger" },
      { status: 500 },
    )
  }
}
