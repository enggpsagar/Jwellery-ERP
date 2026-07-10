import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export async function GET(req: NextRequest) {
  try {
    const format =
      req.nextUrl.searchParams.get("format") ?? "csv";

    const rates = await prisma.metalRate.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    const rows = rates.map((rate) => ({
      Date: new Date(rate.createdAt).toLocaleDateString("en-IN"),
      "24K Gold": Number(rate.gold24k),
      "22K Gold": Number(rate.gold22k),
      "18K Gold": Number(rate.gold18k),
      Silver: Number(rate.silver),
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
    console.error(error);

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

function exportCSV(rows: any[]) {
  const headers = Object.keys(rows[0]).join(",");

  const csvRows = rows.map((row) =>
    Object.values(row)
      .map((value) => `"${value}"`)
      .join(","),
  );

  const csv = [headers, ...csvRows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition":
        `attachment; filename="${getFileName("csv")}"`
    },
  });
}

function exportExcel(rows: any[]) {
  const workbook = XLSX.utils.book_new();

  const worksheet = XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Metal Rates",
  );

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="${getFileName("xlsx")}"`
    },
  });
}

function exportPDF(rows: any[]) {
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

    head: [
      [
        "Date",
        "24K",
        "22K",
        "18K",
        "Silver",
        "Unit",
      ],
    ],

    body: rows.map((row) => [
      row.Date,
      row["24K Gold"],
      row["22K Gold"],
      row["18K Gold"],
      row.Silver,
      row.Unit,
    ]),

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