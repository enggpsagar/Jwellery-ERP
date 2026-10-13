export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"

import { getPartyLedger } from "@/lib/actions/customer-ledger-actions"
import { getCustomerById } from "@/lib/actions/customer-actions"
import { requireStoreScope, assertPlanActiveForExport, PlanExpiredError } from "@/lib/store-context"
import { buildCsvExport, buildExcelExport } from "@/lib/excel-export"
import { partyBalanceDirection } from "@/lib/party-balance"
import { logger } from "@/lib/logger"

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

/**
 * The Party Ledger as CSV / Excel — the same unified rows the page and the
 * emailed statement use (getPartyLedger): opening balance first, then every
 * entry oldest first with Debit / Credit and the running net balance
 * (unsigned, with Receivable / Payable beside it).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const format = new URL(request.url).searchParams.get("format") === "excel" ? "excel" : "csv"

    const storeId = await requireStoreScope()
    await assertPlanActiveForExport(storeId)

    const party = await getCustomerById(id)
    const ledger = party ? await getPartyLedger(id) : null
    if (!party || !ledger) {
      return NextResponse.json({ success: false, message: "Party not found" }, { status: 404 })
    }

    const balanceCells = (net: number) => ({
      "Balance (₹)": Math.abs(net),
      "Balance Type": partyBalanceDirection(net),
    })

    const rows: Record<string, unknown>[] = [
      {
        Date: "",
        Entry: "Opening balance",
        "Document No.": "",
        Description: "",
        "Payment Method": "",
        "Metal / Stone": "",
        "Debit (₹)": "",
        "Credit (₹)": "",
        ...balanceCells(ledger.summary.openingBalance),
      },
      ...ledger.rows.map((row) => ({
        Date: row.entryDate,
        Entry: row.label,
        "Document No.": row.documentNumber ?? "",
        Description: row.description,
        "Payment Method": row.paymentMethod ? (PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod) : "",
        // Exact stored weights (ledger exports keep them unrounded).
        "Metal / Stone": row.metals.length
          ? row.metals.map((metal) => `${metal.label}: ${metal.weight} ${metal.unit}`).join("; ")
          : row.metalWeight != null || row.caratWeight != null
            ? `${row.metalType ?? "Metal"}: ${row.caratWeight ?? row.metalWeight} ${row.caratWeight != null ? "ct" : "g"}`
            : "",
        "Debit (₹)": row.debit || "",
        "Credit (₹)": row.credit || "",
        ...balanceCells(row.balance),
      })),
    ]

    const filePrefix = `${party.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ledger`

    if (format === "excel") {
      const { fileName, fileBase64 } = buildExcelExport(rows, "Party Ledger", filePrefix)
      return new NextResponse(Buffer.from(fileBase64, "base64"), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
    logger.error("Party ledger export failed", error)
    return NextResponse.json({ success: false, message: "Failed to export party ledger" }, { status: 500 })
  }
}
