export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"

import { getKarigarLedger } from "@/lib/actions/ledger-actions"
import { getKarigarById } from "@/lib/actions/karigar-actions"
import {
  buildCsvExport,
  buildMultiSheetExcelExport,
} from "@/lib/excel-export"

type Format = "csv" | "excel"

function financialRow(row: Awaited<ReturnType<typeof getKarigarLedger>>["rows"][number]) {
  return {
    Date: row.date,
    Ledger: "Financial",
    Type: row.type === "DEBIT" ? "Debit" : "Credit",
    Source: row.sourceLabel,
    Description: row.description,
    "Payment Method": row.paymentMethod ?? "",
    "Amount (₹)": row.amount,
    Metal: "",
    "Fine Weight (g)": "",
    "Running Balance": row.runningCashBalance,
  }
}

function materialRow(
  metalLabel: string,
  row: Awaited<ReturnType<typeof getKarigarLedger>>["rows"][number],
) {
  return {
    Date: row.date,
    Ledger: metalLabel,
    Type: row.type === "DEBIT" ? "Issued" : "Received",
    Source: row.sourceLabel,
    Description: row.description,
    "Payment Method": row.paymentMethod ?? "",
    "Amount (₹)": "",
    Metal: metalLabel,
    "Fine Weight (g)": row.metalWeightFine ?? "",
    "Running Balance": row.runningFineGoldBalance,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: karigarId } = await params
    const { searchParams } = new URL(request.url)
    const format = (searchParams.get("format") ?? "csv") as Format

    const [karigar, ledger] = await Promise.all([
      getKarigarById(karigarId),
      getKarigarLedger(karigarId),
    ])

    if (!karigar) {
      return NextResponse.json(
        { success: false, message: "Artisan not found" },
        { status: 404 },
      )
    }

    const filePrefix = `${karigar.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ledger`

    if (format === "excel") {
      const sheets = [
        {
          name: "Financial",
          rows: ledger.rows.map(financialRow),
          columns: ["Date", "Type", "Source", "Description", "Payment Method", "Amount (₹)", "Running Balance"],
        },
        ...ledger.materialGroups.map((group) => ({
          name: group.metalLabel,
          rows: group.rows.map((row) => materialRow(group.metalLabel, row)),
          columns: ["Date", "Type", "Source", "Description", "Fine Weight (g)", "Running Balance"],
        })),
      ]

      const { fileName, fileBase64 } = buildMultiSheetExcelExport(sheets, filePrefix)
      return new NextResponse(Buffer.from(fileBase64, "base64"), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      })
    }

    const rows = [
      ...ledger.rows.map(financialRow),
      ...ledger.materialGroups.flatMap((group) =>
        group.rows.map((row) => materialRow(group.metalLabel, row)),
      ),
    ]

    const { fileName, content } = buildCsvExport(rows, filePrefix)
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error("Karigar ledger export failed:", error)
    return NextResponse.json(
      { success: false, message: "Failed to export artisan ledger" },
      { status: 500 },
    )
  }
}
