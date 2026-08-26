export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"

import {
  getLedgerEntries,
  getMetalDailyLedger,
} from "@/lib/actions/ledger-actions"
import { WEIGHT_BASED_UNITS } from "@/lib/business-units"
import { buildCsvExport, buildExcelExport } from "@/lib/excel-export"

type Scope = "entries" | "metal-wise"
type Format = "csv" | "excel"

async function buildEntriesRows() {
  const entries = await getLedgerEntries()

  return entries.map((entry) => ({
    Date: entry.date,
    Account: entry.account,
    Type: entry.type === "DEBIT" ? "Debit" : "Credit",
    Source: entry.sourceLabel,
    Metal: entry.metalType ?? "",
    "Metal Weight (g)": entry.metalWeight ?? "",
    "Amount (₹)": entry.amount,
    Invoice: entry.invoiceNumber ?? "",
    Description: entry.description,
  }))
}

async function buildMetalWiseRows() {
  const { rows } = await getMetalDailyLedger()

  return rows.flatMap((row) =>
    row.units.map((unit) => {
      const isWeightBased = WEIGHT_BASED_UNITS.includes(unit.unit)

      return {
        Date: row.date,
        Metal: unit.label,
        Unit: isWeightBased ? "g" : "₹",
        Purchased: unit.purchasedValue,
        "Purchased Amount (₹)": unit.purchasedAmount,
        Sold: unit.soldValue,
        "Sold Amount (₹)": unit.soldAmount,
        "Closing Balance": unit.closingBalance,
      }
    }),
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const scope = (searchParams.get("scope") ?? "entries") as Scope
    const format = (searchParams.get("format") ?? "csv") as Format

    const rows =
      scope === "metal-wise" ? await buildMetalWiseRows() : await buildEntriesRows()

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
    console.error("Ledger export failed:", error)
    return NextResponse.json(
      { success: false, message: "Failed to export ledger" },
      { status: 500 },
    )
  }
}
