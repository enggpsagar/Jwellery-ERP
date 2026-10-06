export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"

import { getKarigarLedger, type KarigarLedgerRow } from "@/lib/actions/ledger-actions"
import { getKarigarById } from "@/lib/actions/karigar-actions"
import { requireStoreScope, assertPlanActiveForExport, PlanExpiredError } from "@/lib/store-context"
import {
  buildCsvExport,
  buildMultiSheetExcelExport,
} from "@/lib/excel-export"
import { PAYMENT_METHOD_LABELS } from "@/lib/karigars/karigar-sheet"
import { logger } from "@/lib/logger";

type Format = "csv" | "excel"

const FINANCIAL_COLUMNS = ["Date", "Type", "Source", "Issued By", "Description", "Payment Method", "Amount (₹)", "Running Balance"]
const MATERIAL_COLUMNS = ["Date", "Type", "Source", "Issued By", "Description", "Fine Weight (g)", "Running Balance"]

function paymentMethodLabel(method: string | null) {
  return method ? (PAYMENT_METHOD_LABELS[method] ?? method) : ""
}

function financialRow(row: KarigarLedgerRow) {
  return {
    Date: row.date,
    Ledger: "Financial",
    Type: row.type === "DEBIT" ? "Debit" : "Credit",
    Source: row.sourceLabel,
    "Issued By": row.createdByName ?? "",
    Description: row.description,
    "Payment Method": paymentMethodLabel(row.paymentMethod),
    "Amount (₹)": row.amount,
    Metal: "",
    "Fine Weight (g)": "",
    "Running Balance": row.runningCashBalance,
  }
}

function materialRow(metalLabel: string, row: KarigarLedgerRow) {
  return {
    Date: row.date,
    Ledger: metalLabel,
    Type: row.type === "DEBIT" ? "Issued" : "Received",
    Source: row.sourceLabel,
    "Issued By": row.createdByName ?? "",
    Description: row.description,
    "Payment Method": paymentMethodLabel(row.paymentMethod),
    "Amount (₹)": "",
    Metal: metalLabel,
    "Fine Weight (g)": row.metalWeightFine ?? "",
    "Running Balance": row.runningFineGoldBalance,
  }
}

/** The balance a running total starts from (the artisan's opening cash /
 *  opening gold), as its own first row so the Running Balance column adds up
 *  — the page shows these as its Opening Gold/Cash cards. */
function openingRow(ledger: string, metal: string, balance: number) {
  return {
    Date: "",
    Ledger: ledger,
    Type: "Opening Balance",
    Source: "",
    "Issued By": "",
    Description: "Opening balance",
    "Payment Method": "",
    "Amount (₹)": "",
    Metal: metal,
    "Fine Weight (g)": "",
    "Running Balance": balance,
  }
}

function materialOpening(rows: KarigarLedgerRow[]) {
  const first = rows[0]
  if (!first) return 0
  const signed = (first.type === "DEBIT" ? 1 : -1) * (first.metalWeightFine ?? 0)
  return Math.round((first.runningFineGoldBalance - signed) * 1e5) / 1e5
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: karigarId } = await params
    const { searchParams } = new URL(request.url)
    const format = (searchParams.get("format") ?? "csv") as Format

    const storeId = await requireStoreScope()
    await assertPlanActiveForExport(storeId)

    // Store- and location-scoped lookup first: nothing is read from the
    // ledger for an artisan this user can't see.
    const karigar = await getKarigarById(karigarId)
    if (!karigar) {
      return NextResponse.json(
        { success: false, message: "Artisan not found" },
        { status: 404 },
      )
    }

    // The name makes Source read "<name> Issue"/"<name> Receipt", as on the page.
    const ledger = await getKarigarLedger(karigarId, karigar.name)

    const financialRows = [
      ...(karigar.openingCash !== 0 ? [openingRow("Financial", "", karigar.openingCash)] : []),
      ...ledger.rows.map(financialRow),
    ]
    const groups = ledger.materialGroups.map((group) => {
      const opening = materialOpening(group.rows)
      return {
        metalLabel: group.metalLabel,
        rows: [
          ...(opening !== 0 ? [openingRow(group.metalLabel, group.metalLabel, opening)] : []),
          ...group.rows.map((row) => materialRow(group.metalLabel, row)),
        ],
      }
    })

    const filePrefix = `${karigar.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ledger`

    if (format === "excel") {
      const pick = (row: Record<string, unknown>, columns: string[]) =>
        Object.fromEntries(columns.map((column) => [column, row[column]]))
      const sheets = [
        {
          name: "Financial",
          rows: financialRows.map((row) => pick(row, FINANCIAL_COLUMNS)),
          columns: FINANCIAL_COLUMNS,
        },
        ...groups.map((group) => ({
          name: group.metalLabel,
          rows: group.rows.map((row) => pick(row, MATERIAL_COLUMNS)),
          columns: MATERIAL_COLUMNS,
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

    const rows = [...financialRows, ...groups.flatMap((group) => group.rows)]

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
    logger.error("Karigar ledger export failed", error)
    return NextResponse.json(
      { success: false, message: "Failed to export artisan ledger" },
      { status: 500 },
    )
  }
}
