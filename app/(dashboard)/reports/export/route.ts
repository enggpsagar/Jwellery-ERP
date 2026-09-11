export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"

import type { DateRange } from "@/lib/actions/report-actions"
import { getReportRows, REPORT_LABELS, type ReportType } from "@/lib/report-rows"
import { requireStoreScope, assertPlanActiveForExport } from "@/lib/store-context"
import { buildCsvExport, buildExcelExport } from "@/lib/excel-export"
import { logger } from "@/lib/logger";

type Format = "csv" | "excel"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = (searchParams.get("type") ?? "sales") as ReportType
    const format = (searchParams.get("format") ?? "csv") as Format
    const range: DateRange = {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    }

    if (!(type in REPORT_LABELS)) {
      return NextResponse.json({ success: false, message: "Invalid report type" }, { status: 400 })
    }

    const storeId = await requireStoreScope()
    await assertPlanActiveForExport(storeId)

    const rows = await getReportRows(type, range)
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
    logger.error("Report export failed", error)
    return NextResponse.json(
      { success: false, message: "Failed to export report" },
      { status: 500 },
    )
  }
}
