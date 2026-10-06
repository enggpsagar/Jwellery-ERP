import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  getEffectiveStoreId,
  assertPlanActiveForExport,
  PlanExpiredError,
} from "@/lib/store-context";
import { buildCsvExport, buildExcelExport } from "@/lib/excel-export";
import { getSellingRateHistory } from "@/lib/selling-rates";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Export cap — the whole history in practice; a ceiling, not a product rule. */
const EXPORT_ROW_LIMIT = 20_000;

/**
 * Export of the store's own selling-rate changes (SellingRateEntry) — the
 * "Your Selling Rates" card on /metal-rates. Same gate and formats as the
 * market-rate export in ../../export/route.ts.
 */
export async function GET(req: NextRequest) {
  try {
    const format = req.nextUrl.searchParams.get("format") ?? "csv";

    // /api is outside middleware's matcher, so this route checks the session itself.
    const storeId = await getEffectiveStoreId();
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await assertPlanActiveForExport(storeId);

    const history = await getSellingRateHistory(storeId, EXPORT_ROW_LIMIT);
    const rows = history.map((r) => ({
      "Date & time": new Date(r.date).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      Rate: r.label,
      "Selling price": r.price ?? "Cleared",
      Unit: r.unit,
      "Changed by": r.changedBy ?? "",
    }));

    switch (format) {
      case "csv": {
        const { fileName, content } = buildCsvExport(rows, "selling-rates");
        return new NextResponse(content, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${fileName}"`,
          },
        });
      }
      case "excel": {
        const { fileName, fileBase64 } = buildExcelExport(rows, "Selling Rates", "selling-rates");
        return new NextResponse(Buffer.from(fileBase64, "base64"), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${fileName}"`,
          },
        });
      }
      case "pdf":
        return exportPDF(rows);
      default:
        return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof PlanExpiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error("GET /api/metal-rates/selling/export error", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

function exportPDF(rows: Record<string, string | number>[]) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Your Selling Rates", 14, 20);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [["Date & time", "Rate", "Selling price", "Unit", "Changed by"]],
    body: rows.map((row) => [
      row["Date & time"],
      row.Rate,
      typeof row["Selling price"] === "number"
        ? `Rs. ${row["Selling price"].toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
        : row["Selling price"],
      row.Unit,
      row["Changed by"],
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [212, 175, 55], textColor: 255 },
  });

  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  return new NextResponse(doc.output("arraybuffer"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="selling-rates-${stamp}.pdf"`,
    },
  });
}
