import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/utils";
import { logger } from "@/lib/logger";
import {
  getEffectiveStoreId,
  assertPlanActiveForExport,
  PlanExpiredError,
} from "@/lib/store-context";
import { buildCsvExport, buildExcelExport } from "@/lib/excel-export";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export async function GET(req: NextRequest) {
  try {
    const format =
      req.nextUrl.searchParams.get("format") ?? "csv";

    // /api is outside middleware's matcher, so this route must check the
    // session itself — it used to return every store's rates to anyone.
    const storeId = await getEffectiveStoreId();
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await assertPlanActiveForExport(storeId);

    const rates = await prisma.metalRate.findMany({
      where: { storeId },
      orderBy: {
        createdAt: "desc",
      },
    });

    // 14K gold and Platinum 95 are optional rates — their columns appear
    // only when some row has one, so a gold/silver-only store's file stays
    // as it was.
    const has14k = rates.some((rate) => rate.gold14k != null);
    const hasPlatinum = rates.some((rate) => rate.platinum95 != null);
    const optional = (value: { toString(): string } | null) => (value != null ? Number(value) : "");

    const rows = rates.map((rate) => ({
      Date: formatShortDate(rate.createdAt),
      "24K Gold": Number(rate.gold24k),
      "22K Gold": Number(rate.gold22k),
      "18K Gold": Number(rate.gold18k),
      ...(has14k ? { "14K Gold": optional(rate.gold14k) } : {}),
      Silver: Number(rate.silver),
      ...(hasPlatinum ? { "Platinum 95": optional(rate.platinum95) } : {}),
      Unit: rate.unit,
    }));

    switch (format) {
      case "csv":
        return exportCSV(rows);

      case "excel":
        return exportExcel(rows);

      case "pdf":
        return exportPDF(rows);

      default:
        return NextResponse.json(
          {
            error: "Invalid format",
          },
          {
            status: 400,
          },
        );
    }
  } catch (error) {
    if (error instanceof PlanExpiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error("GET /api/metal-rates/export error", error);

    return NextResponse.json(
      {
        error: "Export failed",
      },
      {
        status: 500,
      },
    );
  }
}
function getFileName(extension: string) {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  return `metal-rates-${yyyy}-${mm}-${dd}-${hh}-${min}.${extension}`;
}

function exportCSV(rows: Record<string, unknown>[]) {
  const { fileName, content } = buildCsvExport(rows, "metal-rates");

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

function exportExcel(rows: Record<string, unknown>[]) {
  const { fileName, fileBase64 } = buildExcelExport(rows, "Metal Rates", "metal-rates");

  return new NextResponse(Buffer.from(fileBase64, "base64"), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

function exportPDF(rows: Record<string, any>[]) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Metal Rate History", 14, 20);

  doc.setFontSize(10);
  doc.text(
    `Generated: ${new Date().toLocaleString("en-IN")}`,
    14,
    28,
  );

  autoTable(doc, {
    startY: 35,

    // Same columns as the CSV/Excel rows (incl. 14K / Platinum 95 when present).
    head: [Object.keys(rows[0] ?? { Date: "", Unit: "" }).map((key) => key.replace(" Gold", ""))],

    body: rows.map((row) => Object.values(row)),

    styles: {
      fontSize: 9,
    },

    headStyles: {
      fillColor: [212, 175, 55],
      textColor: 255,
    },
  });

  const pdf = doc.output("arraybuffer");

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        `attachment; filename="${getFileName("pdf")}"`
    },
  });
}